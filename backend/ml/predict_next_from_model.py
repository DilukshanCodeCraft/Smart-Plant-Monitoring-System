#!/usr/bin/env python3
"""Run inference from latest sensor readings using a trained single or multi-output model."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from train_timeseries_regression import TrainingError, fetch_records, load_mongo_uri, prepare_dataframe


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(description="Predict next values from latest sensor data.")
    parser.add_argument(
        "--model-path",
        default=str(script_dir / "artifacts" / "master_plant_model.joblib"),
        help="Path to the trained model (default: artifacts/master_plant_model.joblib)",
    )
    parser.add_argument("--collection", default="readings", help="MongoDB collection name (default: readings)")
    parser.add_argument("--device-id", default="", help="Optional deviceId filter")
    parser.add_argument("--mongodb-uri", default="", help="Optional connection string override")
    parser.add_argument(
        "--output-json",
        default="",
        help="Optional path to save prediction payload JSON",
    )

    return parser.parse_args()


def ensure_columns(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    next_df = df.copy()

    for column in columns:
        if column not in next_df.columns:
            next_df[column] = np.nan

    return next_df


def run_prediction(args: argparse.Namespace) -> dict[str, Any]:
    model_path = Path(args.model_path).resolve()
    if not model_path.exists():
        # Fallback to old generic name
        old_path = model_path.parent / "timeseries_regression_model.joblib"
        if old_path.exists():
            model_path = old_path
        else:
            raise TrainingError(f"Model file not found: {model_path}. Please run train_timeseries_regression.py first.")

    model_payload = joblib.load(model_path)
    pipeline = model_payload.get("pipeline")
    metadata = model_payload.get("metadata", {})

    if pipeline is None:
        raise TrainingError("Model payload is missing pipeline object.")

    # Detect multi-output or single
    is_multi = metadata.get("isMultiOutput", False)
    target_columns = metadata.get("targetColumns") if is_multi else [metadata.get("targetColumn", "soilPercent")]
    
    if not target_columns:
        raise TrainingError("Model metadata does not specify target columns.")

    horizon_steps = int(metadata.get("horizonSteps", 1))
    max_lag = int(metadata.get("maxLag", 3))
    rolling_windows = metadata.get("rollingWindows", [3, 6])
    
    feature_columns = list(metadata.get("featureColumns", []))
    if not feature_columns:
        raise TrainingError("Model metadata does not include featureColumns.")

    collection = args.collection.strip()
    device_id_raw = args.device_id.strip() or metadata.get("deviceFilter")
    device_id = str(device_id_raw) if device_id_raw else ""

    mongo_uri = args.mongodb_uri.strip() or load_mongo_uri()
    records, database_name = fetch_records(mongo_uri, collection, device_id)

    if not records:
        raise TrainingError(f"No records found in collection '{collection}' to generate prediction input.")

    # Engineering (Turn off target shift for inference)
    df, _numeric, _categorical = prepare_dataframe(
        records=records,
        target_columns=target_columns,
        horizon=horizon_steps,
        max_lag=max_lag,
        rolling_windows=[int(v) for v in rolling_windows],
        include_target_shift=False,
    )

    if df.empty:
        raise TrainingError("Insufficient history for feature engineering. Need more sensor readings.")

    df = ensure_columns(df, feature_columns)
    latest_row = df.sort_values("createdAt").iloc[[-1]].copy()
    latest_features = latest_row[feature_columns]

    prediction_raw = pipeline.predict(latest_features)
    
    # Format Multi-Output results
    predictions = {}
    if is_multi:
        for i, target in enumerate(target_columns):
            predictions[target] = float(prediction_raw[0][i])
    else:
        predictions[target_columns[0]] = float(prediction_raw[0])

    latest_timestamp = latest_row["createdAt"].iloc[0]
    latest_timestamp_iso = latest_timestamp.to_pydatetime().isoformat() if hasattr(latest_timestamp, "to_pydatetime") else str(latest_timestamp)

    payload = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "database": database_name,
        "collection": collection,
        "isMultiOutput": is_multi,
        "horizonSteps": horizon_steps,
        "latestTimestamp": latest_timestamp_iso,
        "predictions": predictions,
        "modelPath": str(model_path),
    }

    if args.output_json.strip():
        output_path = Path(args.output_json).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    return payload


def main() -> None:
    try:
        args = parse_args()
        payload = run_prediction(args)
        print(json.dumps(payload, indent=2))
    except Exception as error:
        print(f"Prediction Error: {error}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
