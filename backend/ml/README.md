# Time-Series Regression Pipeline

This module trains a regression model for plant monitoring time-series data from MongoDB.

## What it does

- Loads historical sensor readings from MongoDB (`roundreadings` by default)
- Cleans data (interpolation + outlier clipping)
- Engineers features:
  - time features (`hour`, `day_of_week`, cyclical sin/cos)
  - lag features (`t-1` to `t-k`)
  - rolling stats (mean/std/min/max)
  - interaction features (e.g., moisture x air temperature)
- Handles categorical variables using one-hot encoding (`deviceId`, `source`, `batchType` when available)
- Uses strict time-based splitting (train -> validation -> test)
- Trains and compares multiple regression models:
  - Linear Regression
  - Random Forest Regressor
  - HistGradientBoosting Regressor
- Exports:
  - trained model artifact (`joblib`)
  - training report (`json`)
  - test predictions (`csv`)
  - analysis plots (`png`)

## Install Python dependencies

```powershell
pip install -r backend/ml/requirements.txt
```

## Run training

### Default (predict next-step soil moisture)

```powershell
python backend/ml/train_timeseries_regression.py
```

### Predict another target (example: weight)

```powershell
python backend/ml/train_timeseries_regression.py --target weightG
```

### Train for one device only

```powershell
python backend/ml/train_timeseries_regression.py --device-id plant-node-01
```

### Use custom lags/horizon

```powershell
python backend/ml/train_timeseries_regression.py --horizon 2 --max-lag 5 --rolling-windows 3,6,12
```

## Run next-step prediction from latest readings

```powershell
python backend/ml/predict_next_from_model.py
```

Optional overrides:

```powershell
python backend/ml/predict_next_from_model.py --collection roundreadings --device-id plant-node-01
```

## Output files

All outputs are written to `backend/ml/artifacts`:

- `timeseries_regression_model.joblib`
- `training_report.json`
- `test_predictions.csv`
- `plots/target_time_trend.png`
- `plots/correlation_heatmap.png`
- `plots/categorical_distribution_<column>.png`
- `plots/test_actual_vs_predicted.png`
- `plots/residual_distribution.png`

## Notes

- This uses **time-based splitting** to avoid leakage.
- If your dataset is small, training is blocked with a clear error.
- You can tune data size requirements with `--min-rows`.
