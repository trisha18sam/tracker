"""
Phase 4 — XGBoost model training.

Trains on HistoricalJourney records from the database.
Train/test split is by journey DATE (not random) to prevent data leakage.

The model predicts: actual_travel_time_residual = actual - hist_avg

Features match exactly the feature vector in backend/app/prediction/engine.py.

Saves to: ml/artifacts/
  xgb_model.joblib
  scaler.joblib
  feature_list.json
  training_metadata.json
"""
from __future__ import annotations

import json
import logging
import math
import os
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"
ARTIFACTS_DIR.mkdir(exist_ok=True)

FEATURE_NAMES = [
    "current_delay_min",
    "current_speed_kmh",
    "speed_ratio",
    "section_hist_avg_travel_time_min",
    "section_hist_std_dev_min",
    "sections_remaining",
    "distance_remaining_km",
    "entry_delay_min",
    "recent_speed_trend",
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
    "train_type_encoded",
    "active_speed_restriction",
    "speed_restriction_ratio",
    "unscheduled_stoppage_ahead",
    "preceding_train_delay_min",
    "cumulative_dwell_excess_min",
    "weather_encoded",
    "section_distance_km",
    "scheduled_travel_time_min",
    "delay_trend",
]

TARGET = "travel_time_residual"   # actual - hist_avg (minutes)


def load_data() -> pd.DataFrame:
    """Load HistoricalJourney records from DB into a DataFrame."""
    from app.database import sync_engine
    engine = sync_engine

    query = """
    SELECT
        hj.id,
        hj.run_id,
        hj.section_id,
        hj.actual_travel_time_min,
        hj.scheduled_travel_time_min,
        hj.entry_delay_min,
        hj.exit_delay_min,
        hj.actual_dwell_time_min,
        hj.scheduled_dwell_time_min,
        hj.entry_speed_kmh,
        hj.avg_speed_kmh,
        hj.hour_of_entry,
        hj.day_of_week,
        CAST(hj.had_speed_restriction AS INTEGER) AS had_speed_restriction,
        CAST(hj.had_unscheduled_stop AS INTEGER) AS had_unscheduled_stop,
        hj.preceding_train_delay_min,
        hj.weather_condition,
        hj.section_entry_time,
        rs.hist_avg_travel_time_min,
        rs.hist_std_dev_min,
        rs.max_speed_kmh AS section_max_speed_kmh,
        rs.distance_km AS section_distance_km,
        rs.scheduled_travel_time_min AS rs_scheduled_min,
        t.train_type,
        tr.run_date
    FROM historical_journeys hj
    JOIN route_sections rs ON rs.id = hj.section_id
    JOIN train_runs tr ON tr.id = hj.run_id
    JOIN trains t ON t.id = tr.train_id
    WHERE hj.data_source = 'SIMULATED'
    ORDER BY tr.run_date, hj.run_id, hj.section_id
    """
    logger.info("Loading historical journeys from DB…")
    df = pd.read_sql(query, engine)
    logger.info("  Loaded %d rows", len(df))
    return df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Build the feature matrix matching the inference engine."""
    TRAIN_TYPE_MAP = {
        "PASSENGER": 0, "MAIL": 1, "EXPRESS": 2,
        "INTERCITY": 3, "SUPERFAST": 4, "SHATABDI": 5, "RAJDHANI": 6,
    }
    WEATHER_MAP = {"CLEAR": 0, "RAIN": 1, "FOG": 2, "STORM": 3}

    df = df.copy()

    # Target: residual from historical average
    df["travel_time_residual"] = (
        df["actual_travel_time_min"] -
        df["hist_avg_travel_time_min"].fillna(df["rs_scheduled_min"])
    )

    # Features
    df["speed_ratio"] = df["entry_speed_kmh"] / df["section_max_speed_kmh"].clip(lower=1)
    df["speed_restriction_ratio"] = 1.0  # simplified: no per-row restriction kmh
    df["unscheduled_stoppage_ahead"] = df["had_unscheduled_stop"].fillna(0)
    df["cumulative_dwell_excess_min"] = (
        df["actual_dwell_time_min"] - df["scheduled_dwell_time_min"]
    ).clip(lower=0).fillna(0)

    df["hour_sin"] = df["hour_of_entry"].apply(lambda h: math.sin(2 * math.pi * h / 24))
    df["hour_cos"] = df["hour_of_entry"].apply(lambda h: math.cos(2 * math.pi * h / 24))
    df["dow_sin"] = df["day_of_week"].apply(lambda d: math.sin(2 * math.pi * d / 7))
    df["dow_cos"] = df["day_of_week"].apply(lambda d: math.cos(2 * math.pi * d / 7))

    df["train_type_encoded"] = df["train_type"].map(TRAIN_TYPE_MAP).fillna(2)
    df["weather_encoded"] = df["weather_condition"].map(WEATHER_MAP).fillna(0)

    # Approximate distance_remaining_km and sections_remaining
    # (section-level approximation using sequence number)
    df["distance_remaining_km"] = df["section_distance_km"]  # simplified
    df["sections_remaining"] = 1  # placeholder — actual value depends on journey context
    df["recent_speed_trend"] = 0.0  # not available in historical records
    df["delay_trend"] = 0.0        # not available in historical records

    # Rename columns to match FEATURE_NAMES
    df["current_delay_min"] = df["entry_delay_min"]
    df["current_speed_kmh"] = df["entry_speed_kmh"]
    df["section_hist_avg_travel_time_min"] = df["hist_avg_travel_time_min"].fillna(df["rs_scheduled_min"])
    df["section_hist_std_dev_min"] = df["hist_std_dev_min"].fillna(3.0)
    df["active_speed_restriction"] = df["had_speed_restriction"].fillna(0)
    df["scheduled_travel_time_min"] = df["rs_scheduled_min"]

    return df


def train_model(df: pd.DataFrame):
    """Train XGBoost on 80% of data (earliest 80% by date), validate on last 20%."""
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import mean_absolute_error, mean_squared_error
    import xgboost as xgb
    import joblib

    df = engineer_features(df)

    # Remove rows with NaN in features or target
    df = df.dropna(subset=FEATURE_NAMES + [TARGET])
    logger.info("  Clean dataset: %d rows", len(df))

    # Date-based split
    df["run_date"] = pd.to_datetime(df["run_date"])
    cutoff = df["run_date"].quantile(0.8)
    train_df = df[df["run_date"] <= cutoff]
    test_df  = df[df["run_date"] > cutoff]

    logger.info("  Train set: %d rows (up to %s)", len(train_df), cutoff.date())
    logger.info("  Test  set: %d rows (after %s)", len(test_df), cutoff.date())

    X_train = train_df[FEATURE_NAMES].values.astype(np.float32)
    y_train = train_df[TARGET].values.astype(np.float32)
    X_test  = test_df[FEATURE_NAMES].values.astype(np.float32)
    y_test  = test_df[TARGET].values.astype(np.float32)

    # Scale
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)

    # XGBoost
    model = xgb.XGBRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=-1,
        verbosity=0,
    )

    logger.info("Training XGBoost…")
    model.fit(
        X_train_s, y_train,
        eval_set=[(X_test_s, y_test)],
        verbose=50,
    )

    # Evaluate
    y_pred_train = model.predict(X_train_s)
    y_pred_test  = model.predict(X_test_s)

    results = {
        "train_mae":  float(mean_absolute_error(y_train, y_pred_train)),
        "train_rmse": float(np.sqrt(mean_squared_error(y_train, y_pred_train))),
        "test_mae":   float(mean_absolute_error(y_test, y_pred_test)),
        "test_rmse":  float(np.sqrt(mean_squared_error(y_test, y_pred_test))),
        "n_train":    int(len(train_df)),
        "n_test":     int(len(test_df)),
    }
    logger.info("Results: %s", results)

    # Feature importance
    importance = dict(zip(FEATURE_NAMES, model.feature_importances_.tolist()))
    top_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:10]
    logger.info("Top features: %s", top_features)

    # Save artifacts
    joblib.dump(model, ARTIFACTS_DIR / "xgb_model.joblib")
    joblib.dump(scaler, ARTIFACTS_DIR / "scaler.joblib")

    with open(ARTIFACTS_DIR / "feature_list.json", "w") as f:
        json.dump(FEATURE_NAMES, f, indent=2)

    meta = {
        "model_name": "XGBRegressor",
        "model_version": "xgb_v1",
        "target": TARGET,
        "trained_at": datetime.utcnow().isoformat(),
        "training_journeys": int(train_df["run_id"].nunique()),
        "test_journeys": int(test_df["run_id"].nunique()),
        "train_cutoff_date": str(cutoff.date()),
        "results": results,
        "feature_importance": importance,
        "data_source": "SIMULATED",
        "note": "Model trained on synthetic data. Connect real IRCTC/NTES data to retrain.",
    }

    with open(ARTIFACTS_DIR / "training_metadata.json", "w") as f:
        json.dump(meta, f, indent=2)

    logger.info("✓ Model artifacts saved to %s", ARTIFACTS_DIR)

    # Also compute per-section RMSE for confidence calculation
    test_df = test_df.copy()
    test_df["prediction"] = y_pred_test
    test_df["error"] = test_df["prediction"] - test_df[TARGET]
    section_rmse = (
        test_df.groupby("section_id")["error"]
        .apply(lambda x: float(np.sqrt((x**2).mean())))
        .to_dict()
    )
    # Convert keys to int
    section_rmse = {int(k): v for k, v in section_rmse.items()}
    with open(ARTIFACTS_DIR / "section_rmse.json", "w") as f:
        json.dump(section_rmse, f, indent=2)

    return model, scaler, results


if __name__ == "__main__":
    df = load_data()
    model, scaler, results = train_model(df)
    logger.info("Training complete. MAE=%.2f RMSE=%.2f min", results["test_mae"], results["test_rmse"])
