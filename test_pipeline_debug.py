import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.abspath("backend"))

from app.database import AsyncSessionLocal
from app.models import TrainRun, TrainTelemetry
from app.prediction.service import run_prediction_pipeline
from sqlalchemy import select

async def test():
    async with AsyncSessionLocal() as db:
        # Fetch a telemetry record
        tel_q = await db.execute(select(TrainTelemetry).order_by(TrainTelemetry.id.desc()).limit(1))
        tel = tel_q.scalar_one_or_none()
        print("Telemetry found:", tel.id if tel else None, "for run:", tel.run_id if tel else None)

        if tel:
            try:
                preds = await run_prediction_pipeline(db, tel.run_id, tel)
                print("Predictions returned count:", len(preds))
                for p in preds[:3]:
                    print(f"  Station {p.station_id}: ETA={p.predicted_eta}, Delay={p.predicted_delay_min}m")
            except Exception as e:
                import traceback
                traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
