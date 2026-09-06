"""
Simulation loop runner — restarts both train simulations automatically
whenever a train reaches its terminus. Keeps live data flowing indefinitely.
"""
import asyncio
import logging
import subprocess
import sys
import os

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)

PYTHON = sys.executable
ENGINE = os.path.join(os.path.dirname(__file__), "engine.py")

TRAINS = [
    {"train_id": 1, "delay": 5},
    {"train_id": 2, "delay": 12},
]


async def run_train(train_id: int, delay: int):
    """Run simulation engine for one train, restart automatically on completion."""
    run_number = 0
    while True:
        run_number += 1
        logger.info(f"[Train {train_id}] Starting simulation run #{run_number} (origin delay={delay} min)")
        proc = await asyncio.create_subprocess_exec(
            PYTHON, ENGINE,
            "--train-id", str(train_id),
            "--delay", str(delay),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        # Stream output
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            logger.info(f"[Train {train_id}] {line.decode().rstrip()}")

        await proc.wait()
        logger.info(f"[Train {train_id}] Run #{run_number} complete (exit={proc.returncode}). Restarting in 3s...")
        await asyncio.sleep(3)


async def main():
    logger.info("TrackIQ Simulation Loop started — trains will auto-restart after terminus.")
    tasks = [run_train(t["train_id"], t["delay"]) for t in TRAINS]
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
