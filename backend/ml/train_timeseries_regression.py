#!/usr/bin/env python3
"""
Advanced Multi-Output Time-Series Regression Pipeline for Smart Plant Monitoring.
Tuned for predicting multiple environmental targets (e.g., Soil, Temp, Humidity) simultaneously.
Includes botanically-proven interactions like VPD, Thermal Delta, and Evapotranspiration.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from dotenv import load_dotenv
from pymongo import MongoClient
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error, mean_squared_error, r2_score
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

# Configuration & Theme
plt.style.use("seaborn-v0_8-whitegrid")
sns.set_theme(style="whitegrid", palette="viridis")


class TrainingError(Exception):
    """Custom exception for training pipeline errors."""


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(description="Multi-Output Time-Series Regression Training.")
    parser.add_argument(
        "--target",
        default="soilPercent,airTempC,humidity",
        help="Comma-separated target columns to predict (default: soilPercent,airTempC,humidity)",
    )
    parser.add_argument(
        "--collection",
        default="readings",
        help="MongoDB collection name (default: readings)",
    )
    parser.add_argument("--device-id", default="", help="Optional deviceId filter")
    parser.add_argument(
        "--horizon",
        type=int,
        default=1,
        help="Prediction horizon in steps (default: 1)",
    )
    parser.add_argument(
        "--max-lag",
        type=int,
        default=5,
        help="Maximum lag features to generate (default: 5)",
    )
    parser.add_argument(
        "--rolling-windows",
        default="3,6",
        help="Comma-separated list of rolling window sizes (default: 3,6)",
    )
    parser.add_argument(
        "--train-ratio",
        type=float,
        default=0.7,
        help="Ratio of data for training (default: 0.7)",
    )
    parser.add_argument(
        "--validation-ratio",
        type=float,
        default=0.15,
        help="Ratio of data for validation (default: 0.15)",
    )
    parser.add_argument(
        "--max-category-cardinality",
        type=int,
        default=30,
        help="Max unique values allowed for one-hot categorical columns (default: 30)",
    )
    parser.add_argument("--random-state", type=int, default=42, help="Random seed for reproducible models")
    parser.add_argument("--mongodb-uri", default="", help="Optional connection string override")
    parser.add_argument("--disable-plots", action="store_true", help="Skip plot generation")
    parser.add_argument(
        "--output-dir",
        default=str(script_dir / "artifacts"),
        help="Output directory for artifacts (default: backend/ml/artifacts)",
    )

    args = parser.parse_args()
    return args


def load_mongo_uri() -> str:
    # Try to load from ../.env if possible
    backend_dir = Path(__file__).resolve().parents[1]
    env_path = backend_dir / ".env"
    load_dotenv(dotenv_path=env_path)

    value = os.getenv("MONGODB_URI", "").strip()
    if not value:
        raise TrainingError("MONGODB_URI is missing. Set backend/.env before running training.")

    return value


def get_database(client: MongoClient):
    try:
        return client.get_default_database()
    except Exception:
        return client["smartplant"]


def fetch_records(mongo_uri: str, collection_name: str, device_id: str) -> tuple[list[dict[str, Any]], str]:
    query: dict[str, Any] = {}
    if device_id:
        query["deviceId"] = device_id

    # Priority: Local Data Bridge Fallback (Fixes DNS errors)
    dump_path = Path(__file__).resolve().parent / "readings_dump.json"
    if dump_path.exists():
        try:
            with open(dump_path, "r", encoding="utf-8") as f:
                records = json.load(f)
                if records:
                    print(f"[FETCH] Local Bridge Active: Loaded {len(records)} records from {dump_path.name}")
                    return records, "local_bridge"
        except Exception as e:
            print(f"Warning: Failed to load local bridge: {e}")

    # Standard MongoDB Path
    client = MongoClient(mongo_uri)
    try:
        database = get_database(client)
        print(f"[FETCH] Database: {database.name}, Collection: {collection_name}, Query: {query}")
        records = list(database[collection_name].find(query).sort("createdAt", 1))
        return records, database.name
    finally:
        client.close()


def add_interaction_features(df: pd.DataFrame) -> pd.DataFrame:
    """Inject botanically-proven relations into the feature set."""
    out = df.copy()

    # 1) VPD (Vapor Pressure Deficit) - Critical for plant drying rates
    # Simple VPD calc based on temp and humidity
    if "airTempC" in out.columns and "humidity" in out.columns:
        # Saturation Vapor Pressure (kPa)
        es = 0.6108 * np.exp((17.27 * out["airTempC"]) / (out["airTempC"] + 237.3))
        # Actual Vapor Pressure
        ea = es * (out["humidity"] / 100.0)
        out["vpd"] = es - ea

    # 2) Thermal Delta (Air vs Root)
    if "airTempC" in out.columns and "rootTempC" in out.columns:
        out["tempDifferential"] = out["airTempC"] - out["rootTempC"]
        out["root_air_temp_ratio"] = out["rootTempC"] / (out["airTempC"] + 0.001)

    # 3) Drought Risk Index (Soil vs VPD)
    if "soilPercent" in out.columns and "vpd" in out.columns:
        out["drought_risk_index"] = out["vpd"] / (out["soilPercent"] + 0.1)

    return out


def prepare_dataframe(
    records: list[dict[str, Any]],
    target_columns: list[str],
    horizon: int = 1,
    max_lag: int = 3,
    rolling_windows: list[int] = [3, 6],
    include_target_shift: bool = True,
) -> tuple[pd.DataFrame, list[str], list[str]]:
    df = pd.DataFrame(records)

    # Convert createdAt to datetime
    if "createdAt" in df.columns:
        df["createdAt"] = pd.to_datetime(df["createdAt"])
    else:
        df["createdAt"] = pd.to_datetime(datetime.utcnow())

    # Drop non-feature columns
    drop_candidates = ["_id", "updatedAt", "__v", "intervals", "history", "raw", "alerts"]
    df = df.drop(columns=[c for c in drop_candidates if c in df.columns])

    # Basic Time Features
    df["hour"] = df["createdAt"].dt.hour
    df["dayOfWeek"] = df["createdAt"].dt.dayofweek
    df["month"] = df["createdAt"].dt.month

    # Seasonal Sin/Cos Encoding
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)

    # Add Botanical Relations
    df = add_interaction_features(df)

    # Sorting
    df = df.sort_values("createdAt")

    # Column Identification
    numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_columns = df.select_dtypes(exclude=[np.number, "datetime64[ns]"]).columns.tolist()

    # Time-Series Engineering: Lags & Rolling Statistics
    # We apply this to the primary sensor columns
    core_sensors = list(set(target_columns + ["airTempC", "humidity", "soilPercent", "lux", "vpd"]))
    core_sensors = [c for c in core_sensors if c in df.columns]

    engineered_features = []

    for col in core_sensors:
        # Lags
        for lag in range(1, max_lag + 1):
            df[f"{col}_lag_{lag}"] = df[col].shift(lag)
            engineered_features.append(f"{col}_lag_{lag}")

        # Rolling
        for window in rolling_windows:
            df[f"{col}_roll_mean_{window}"] = df[col].rolling(window=window).mean()
            df[f"{col}_roll_std_{window}"] = df[col].rolling(window=window).std()
            df[f"{col}_roll_min_{window}"] = df[col].rolling(window=window).min()
            df[f"{col}_roll_max_{window}"] = df[col].rolling(window=window).max()
            engineered_features.extend(
                [
                    f"{col}_roll_mean_{window}",
                    f"{col}_roll_std_{window}",
                    f"{col}_roll_min_{window}",
                    f"{col}_roll_max_{window}",
                ]
            )

    # Multi-Output Target Ground Truth
    if include_target_shift:
        for target in target_columns:
            df[f"{target}_next"] = df[target].shift(-horizon)

    # Clean up non-hashable types (like lists/dicts) before identifying categorical columns
    # These often come from nested MongoDB structures like 'intervals'
    for col in df.columns:
        if df[col].apply(lambda x: isinstance(x, (list, dict))).any():
            df = df.drop(columns=[col])

    # Drop NaNs
    df = df.dropna().reset_index(drop=True)

    # Column Identification
    numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_columns = df.select_dtypes(exclude=[np.number, "datetime64[ns]"]).columns.tolist()

    return df, numeric_columns, categorical_columns


def split_timeseries(df: pd.DataFrame, train_ratio: float, val_ratio: float):
    n = len(df)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    train = df.iloc[:train_end]
    validation = df.iloc[train_end:val_end]
    test = df.iloc[val_end:]

    return train, validation, test


def prepare_pipelines(
    numeric_features: list[str],
    categorical_features: list[str],
    random_state: int,
):
    numeric_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )

    categorical_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="constant", fill_value="missing")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, numeric_features),
            ("cat", categorical_transformer, categorical_features),
        ]
    )

    # Wrap models that don't natively support multi-output in a MultiOutputRegressor
    model_candidates = {
        "ridge": MultiOutputRegressor(Ridge(random_state=random_state)),
        "random_forest": RandomForestRegressor(n_estimators=100, random_state=random_state, n_jobs=-1),
        "linear_regression": MultiOutputRegressor(LinearRegression()),
    }

    return preprocessor, model_candidates


def compute_multi_metrics(y_true: np.ndarray, y_pred: np.ndarray, target_names: list[str]) -> dict[str, Any]:
    overall_metrics = {}
    target_specific = {}

    for i, target in enumerate(target_names):
        yi_true = y_true[:, i]
        yi_pred = y_pred[:, i]
        
        target_specific[target] = {
            "mae": float(mean_absolute_error(yi_true, yi_pred)),
            "rmse": float(np.sqrt(mean_squared_error(yi_true, yi_pred))),
            "mape": float(mean_absolute_percentage_error(yi_true, yi_pred)) * 100.0,
            "r2": float(r2_score(yi_true, yi_pred)),
        }

    overall_metrics["targets"] = target_specific
    overall_metrics["mean_r2"] = float(np.mean([m["r2"] for m in target_specific.values()]))

    return overall_metrics


def save_figure(path: Path):
    try:
        plt.savefig(path, dpi=145)
    except PermissionError:
        print(f"Warning: Could not overwrite {path.name} (file in use).")
def save_plots(
    full_df: pd.DataFrame,
    test_df: pd.DataFrame,
    test_prediction: np.ndarray,
    target_columns: list[str],
    numeric_columns: list[str],
    categorical_columns: list[str],
    output_dir: Path,
    pipeline: Pipeline,
    metrics: dict
) -> None:
    plots_dir = output_dir / "plots"
    plots_dir.mkdir(parents=True, exist_ok=True)

    # 1) CONSOLIDATED TECHNICAL BRIEF (THE "MASTER" SLIDE)
    plt.figure(figsize=(16, 12))
    plt.suptitle("MASTER PLANT AI: SYSTEM-WIDE PERFORMANCE BRIEF", fontsize=22, fontweight='bold', color='#2F4F4F', y=0.98)
    
    # I. Accuracy Table
    plt.subplot(2, 2, 1)
    plt.title("I. CORE ACCURACY METRICS (R² / MAE)", fontsize=14, loc='left', pad=15)
    cell_text = []
    
    target_results = metrics.get("targets", {})
    for t in target_columns:
        if t in target_results:
            res = target_results[t]
            cell_text.append([t.upper(), f"{res['r2']*100:.2f}%", f"{res['mae']:.4f}"])
        else:
            cell_text.append([t.upper(), "N/A", "N/A"])
    
    table = plt.table(cellText=cell_text, colLabels=["SENSOR TARGET", "ACCURACY (R²)", "AVG ERROR (MAE)"], 
                      loc='center', cellLoc='center')
    table.auto_set_font_size(False)
    table.set_fontsize(11)
    table.scale(1.2, 2.5)
    plt.axis('off')

    # II. Top 10 Feature Drivers
    plt.subplot(2, 2, 2)
    feature_signal = extract_feature_signal(pipeline)
    if feature_signal:
        top_10 = feature_signal[:10]
        sns.barplot(x=[s["score"] for s in top_10], y=[s["feature"] for s in top_10], palette="flare_r")
        plt.title("II. TOP 10 BIOLOGICAL DRIVERS", fontsize=14, loc='left', pad=15)
        plt.xlabel("Scientific Impact Score")
    else:
        plt.text(0.5, 0.5, "Importance Data Missing", ha='center')

    # III. System-Wide Precision
    plt.subplot(2, 1, 2)
    plt.title("III. SYSTEM-WIDE REGRESSION PRECISION MAP (ALL SENSORS)", fontsize=14, loc='left', pad=15)
    for i, t in enumerate(target_columns):
        y_true = test_df[f"{t}_next"].to_numpy()
        y_pred = test_prediction[:, i]
        plt.scatter(y_true, y_pred, alpha=0.3, label=f"True vs Pred: {t}")
    
    # Red Identity Line
    plt.plot([0, 100], [0, 100], color="#b13e39", ls="--", alpha=0.8, label="Ideal Fit")
    plt.legend(loc="upper left")
    plt.xlabel("Actual Reality")
    plt.ylabel("AI Brain Forecast")

    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    save_figure(plots_dir / "master_technical_summary_brief.png")

    # 2) Master System Trends (Holistic Forecast)
    fig, axes = plt.subplots(len(target_columns), 1, figsize=(15, 4 * len(target_columns)), sharex=True)
    if len(target_columns) == 1:
        axes = [axes]
    
    sample = full_df.tail(300)
    for i, target in enumerate(target_columns):
        ax = axes[i]
        ax.plot(sample["createdAt"], sample[target], label=f"Current {target}", color="#2f628a", alpha=0.6)
        ax.plot(sample["createdAt"], sample[f"{target}_next"], label=f"Next {target} (Truth)", color="#b13e39", ls="--", alpha=0.8)
        ax.set_title(f"Master Environmental Signal: {target}")
        ax.set_ylabel(target)
        ax.legend(loc="upper left")

    plt.xlabel("Timeline")
    plt.tight_layout()
    save_figure(plots_dir / "master_system_trends.png")

    # 3) Feature Importance Detail
    if feature_signal:
        plt.figure(figsize=(12, 10))
        top_25 = feature_signal[:25]
        sns.barplot(x=[s["score"] for s in top_25], y=[s["feature"] for s in top_25], palette="mako")
        plt.title("Master Importance: Which Sensors Drive the Entire System?")
        plt.xlabel("Importance Score")
        plt.tight_layout()
        save_figure(plots_dir / "master_feature_importance.png")

    # 4) Precision Scatters Detail
    fig, axes = plt.subplots(1, len(target_columns), figsize=(6 * len(target_columns), 6))
    if len(target_columns) == 1: axes = [axes]
    for i, target in enumerate(target_columns):
        ax = axes[i]
        y_true = test_df[f"{target}_next"].to_numpy()
        y_pred = test_prediction[:, i]
        ax.scatter(y_true, y_pred, alpha=0.3, color="#2f8a62")
        lims = [min(y_true.min(), y_pred.min()), max(y_true.max(), y_pred.max())]
        ax.plot(lims, lims, color="#b13e39", ls="--", lw=2)
        ax.set_title(f"Precision: {target}")
    plt.tight_layout()
    save_figure(plots_dir / "master_precision_regressions.png")


def extract_feature_signal(pipeline: Pipeline) -> list[dict[str, float]]:
    """Determine which features influenced the multi-output model most."""
    try:
        model = pipeline.named_steps["model"]
        preprocessor = pipeline.named_steps["preprocessor"]

        # Get feature names after one-hot encoding
        feature_names = []
        for name, transformer, columns in preprocessor.transformers_:
            if name == "num":
                feature_names.extend(columns)
            elif name == "cat":
                try:
                    names = transformer.named_steps["onehot"].get_feature_names_out(columns)
                    feature_names.extend(names)
                except Exception:
                    feature_names.extend(columns)

        # Handle MultiOutputRegressor wrapper vs direct models (like RandomForest)
        if isinstance(model, MultiOutputRegressor):
            est_importances = []
            for estimator in model.estimators_:
                if hasattr(estimator, "feature_importances_"):
                    est_importances.append(estimator.feature_importances_)
                elif hasattr(estimator, "coef_"):
                    # Use absolute value of coefficients for importance
                    est_importances.append(np.abs(estimator.coef_))
            
            if not est_importances:
                return []
            importances = np.mean(est_importances, axis=0)
        elif hasattr(model, "feature_importances_"):
            importances = model.feature_importances_
        elif hasattr(model, "coef_"):
            importances = np.mean(np.abs(model.coef_), axis=0) if model.coef_.ndim > 1 else np.abs(model.coef_)
        else:
            return []

        signal = [{"feature": f, "score": float(s)} for f, s in zip(feature_names, importances)]
        signal.sort(key=lambda x: x["score"], reverse=True)
        return signal
    except Exception as e:
        print(f"Warning: Could not extract feature importance: {e}")
        return []


def train_pipeline(args: argparse.Namespace) -> dict[str, Any]:
    target_columns = [t.strip() for t in args.target.split(",") if t.strip()]
    rolling_windows = [int(w.strip()) for w in args.rolling_windows.split(",") if w.strip()]
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    mongo_uri = args.mongodb_uri.strip() or load_mongo_uri()
    records, database_name = fetch_records(mongo_uri, args.collection, args.device_id.strip())

    if not records:
        raise TrainingError(f"No records found in collection '{args.collection}'. Check deviceId or connection.")

    # Engineering
    df, core_numeric, core_categorical = prepare_dataframe(
        records=records,
        target_columns=target_columns,
        horizon=args.horizon,
        max_lag=args.max_lag,
        rolling_windows=rolling_windows,
        include_target_shift=True,
    )

    y_columns = [f"{t}_next" for t in target_columns]
    feature_columns = [c for c in df.columns if c not in y_columns and c != "createdAt"]

    # Refine categorical based on cardinality
    final_categorical = []
    for col in core_categorical:
        if col in feature_columns:
            if df[col].nunique() <= args.max_category_cardinality:
                final_categorical.append(col)

    # Strictly only use columns with numeric dtypes for numeric features
    final_numeric = df[feature_columns].select_dtypes(include=[np.number]).columns.tolist()

    # Split
    train_df, val_df, test_df = split_timeseries(df, args.train_ratio, args.validation_ratio)

    x_train, y_train = train_df[feature_columns], train_df[y_columns]
    x_val, y_val = val_df[feature_columns], val_df[y_columns]
    x_test, y_test = test_df[feature_columns], test_df[y_columns]

    # Model Selection
    preprocessor, model_candidates = prepare_pipelines(final_numeric, final_categorical, args.random_state)

    best_r2 = -float("inf")
    best_model_name = ""

    print(f"[TRAIN] Evaluating {len(model_candidates)} candidate multi-output architectures...")

    for name, model in model_candidates.items():
        pipe = Pipeline(steps=[("preprocessor", preprocessor), ("model", model)])
        pipe.fit(x_train, y_train)
        preds = pipe.predict(x_val)
        
        # We use mean R2 across all targets to pick the winner
        r2 = r2_score(y_val, preds)
        print(f"  - {name}: Mean R2 = {r2:.4f}")

        if r2 > best_r2:
            best_r2 = r2
            best_model_name = name

    # Fit final on Train + Val
    x_full = pd.concat([x_train, x_val])
    y_full = pd.concat([y_train, y_val])

    final_pipe = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model_candidates[best_model_name]),
        ]
    )
    final_pipe.fit(x_full, y_full)

    # Test Metrics
    test_preds = final_pipe.predict(x_test)
    report = compute_multi_metrics(y_test.to_numpy(), test_preds, target_columns)
    
    # Feature Signal
    model_signal = extract_feature_signal(final_pipe)

    # Export
    now_iso = datetime.utcnow().isoformat() + "Z"
    model_payload = {
        "pipeline": final_pipe,
        "metadata": {
            "generatedAt": now_iso,
            "targetColumns": target_columns,
            "horizonSteps": args.horizon,
            "maxLag": args.max_lag,
            "rollingWindows": rolling_windows,
            "featureColumns": feature_columns,
            "numericFeatures": final_numeric,
            "categoricalFeatures": final_categorical,
            "collection": args.collection,
            "deviceFilter": args.device_id.strip() or None,
            "isMultiOutput": True,
        },
    }

    model_path = output_dir / "master_plant_model.joblib"
    report_path = output_dir / "master_report.json"
    
    joblib.dump(model_payload, model_path)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8") 

    if not args.disable_plots:
        # Generate Plots and Dashboard Evidence
        save_plots(
            full_df=df,
            test_df=test_df,
            test_prediction=test_preds, # Use test_preds
            target_columns=target_columns,
            numeric_columns=final_numeric,
            categorical_columns=final_categorical,
            output_dir=output_dir,
            pipeline=final_pipe,
            metrics=report
        )

    return {
        "best_model": best_model_name,
        "rows": len(df),
        "test_metrics": report, 
        "model_path": str(model_path),
        "report_path": str(report_path),
        "plots_dir": str(output_dir / "plots"),
    }


def main():
    try:
        args = parse_args()
        results = train_pipeline(args)
        print("\nMulti-Output Training Success!")
        print(json.dumps(results, indent=2))
    except Exception as e:
        print(f"\nUnhandled error: {e}")
        import traceback
        traceback.print_exc()
        raise SystemExit(1)


if __name__ == "__main__":
    main()
