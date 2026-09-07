"""
Seed Train 12015 (Ajmer Shatabdi Express) into tracker.db for New Delhi -> Jaipur comparison.
"""
import sqlite3
from datetime import datetime, date, timedelta

from pathlib import Path

def seed_12015():
    db_path = Path(__file__).resolve().parent.parent / 'tracker.db'
    conn = sqlite3.connect(str(db_path))
    c = conn.cursor()

    # Check if train 12015 already exists
    c.execute("SELECT id FROM trains WHERE number = '12015'")
    row = c.fetchone()
    if row:
        print(f"Train 12015 already exists with id {row[0]}")
        train_id = row[0]
    else:
        # Route id 1 is Delhi-Mumbai/Rajasthan route
        c.execute("""
            INSERT INTO trains (number, name, train_type, route_id, rake_type, max_speed_kmh, runs_on_days, is_active)
            VALUES ('12015', 'Ajmer Shatabdi Express', 'SHATABDI', 1, 'LHB', 130.0, 'DAILY', 1)
        """)
        train_id = c.lastrowid
        print(f"Inserted train 12015 with id {train_id}")

        # Scheduled stops: NDLS -> DEC -> JP -> AII
        # NDLS (1), DEC (16), JP (5), AII (6)
        stops = [
            (train_id, 1, 1, 1, None, 0.0, None, '06:10', 0),
            (train_id, 1, 16, 2, 28.0, 30.0, '06:38', '06:40', 0),
            (train_id, 1, 5, 3, 270.0, 275.0, '10:40', '10:45', 0),
            (train_id, 1, 6, 4, 405.0, None, '12:55', None, 0),
        ]
        c.executemany("""
            INSERT INTO scheduled_stops (train_id, route_id, station_id, stop_number, scheduled_arrival_offset_min, scheduled_departure_offset_min, arrival_time_str, departure_time_str, day_offset)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, stops)
        print("Inserted scheduled stops for train 12015")

        # Coaches: E1 (EC, 56 seats), C1, C2, C3 (CC, 78 seats each)
        coaches_data = [
            (train_id, 'E1', 'EC', 1, 56, 'EXECUTIVE'),
            (train_id, 'C1', 'CC', 2, 78, 'CHAIR_CAR_3x2'),
            (train_id, 'C2', 'CC', 3, 78, 'CHAIR_CAR_3x2'),
            (train_id, 'C3', 'CC', 4, 78, 'CHAIR_CAR_3x2'),
        ]
        c.executemany("""
            INSERT INTO coaches (train_id, coach_code, coach_class, sequence_in_rake, total_seats, layout_type)
            VALUES (?, ?, ?, ?, ?, ?)
        """, coaches_data)
        print("Inserted coaches for train 12015")

        # Get coach ids
        c.execute("SELECT id, coach_code, coach_class, total_seats FROM coaches WHERE train_id = ?", (train_id,))
        coaches = c.fetchall()

        seat_ids = []
        for coach_id, c_code, c_class, total_seats in coaches:
            for s_num in range(1, total_seats + 1):
                if c_class == 'EC':
                    b_type = 'WINDOW' if s_num % 4 in (1, 0) else 'AISLE'
                else:
                    b_type = 'WINDOW' if s_num % 5 in (1, 0) else ('MIDDLE' if s_num % 5 in (2, 4) else 'AISLE')
                
                c.execute("""
                    INSERT INTO seats (coach_id, seat_number, berth_type, bay_number, is_window, is_emergency_quota)
                    VALUES (?, ?, ?, ?, ?, 0)
                """, (coach_id, s_num, b_type, (s_num - 1) // 6 + 1, 1 if b_type == 'WINDOW' else 0))
                seat_ids.append((c.lastrowid, c_class, s_num))

        print(f"Inserted {len(seat_ids)} seats for train 12015")

        # Create active TrainRun for today
        today_str = date.today().isoformat()
        now_iso = datetime.utcnow().isoformat()
        c.execute("""
            INSERT INTO train_runs (train_id, run_date, status, data_source, origin_delay_min, current_delay_min, journey_start_time)
            VALUES (?, ?, 'RUNNING', 'SIMULATED', 0.0, 0.0, ?)
        """, (train_id, today_str, now_iso))
        run_id = c.lastrowid
        print(f"Created active train run {run_id} for train 12015")

        # Add initial telemetry
        c.execute("""
            INSERT INTO train_telemetry (run_id, timestamp, latitude, longitude, speed_kmh, distance_covered_km, cumulative_delay_min, current_section_id, current_station_id, data_source)
            VALUES (?, ?, 28.05, 76.50, 115.0, 140.0, 0.0, 1, 1, 'SIMULATED')
        """, (run_id, now_iso))
        print("Inserted telemetry for train 12015")

        # Add occupancies so Delhi -> Jaipur has 14 seats in CC and 3 seats in EC available
        # Leave seats 1..3 in E1 available; occupy seats 4..56
        # Leave seats 1..14 in C1 available; occupy seats 15..78 in C1, and all in C2, C3
        for seat_id, c_class, s_num in seat_ids:
            is_available = False
            if c_class == 'EC' and s_num <= 3:
                is_available = True
            elif c_class == 'CC' and s_num <= 14:
                is_available = True
            
            if not is_available:
                pnr = f"PNR{7000000 + seat_id}"
                c.execute("""
                    INSERT INTO seat_occupancies (seat_id, train_run_id, from_station_id, to_station_id, status, passenger_masked_pnr)
                    VALUES (?, ?, 1, 5, 'CONFIRMED', ?)
                """, (seat_id, run_id, pnr))

        # Add ETA predictions for upcoming stops (JP and AII)
        eta_jp = (datetime.utcnow() + timedelta(hours=2)).isoformat()
        eta_aii = (datetime.utcnow() + timedelta(hours=4, minutes=15)).isoformat()
        sched_jp = eta_jp
        sched_aii = eta_aii

        c.execute("""
            INSERT INTO eta_predictions (run_id, station_id, predicted_at, scheduled_eta, predicted_eta, predicted_delay_min, lower_bound_eta, upper_bound_eta, confidence_score, model_version, explanation)
            VALUES (?, 5, ?, ?, ?, 0.0, ?, ?, 0.95, 'xgb_v1', 'Running strictly on schedule across Rewari-Alwar corridor. Clear signals.')
        """, (run_id, now_iso, sched_jp, eta_jp, eta_jp, eta_jp))

        c.execute("""
            INSERT INTO eta_predictions (run_id, station_id, predicted_at, scheduled_eta, predicted_eta, predicted_delay_min, lower_bound_eta, upper_bound_eta, confidence_score, model_version, explanation)
            VALUES (?, 6, ?, ?, ?, 0.0, ?, ?, 0.94, 'xgb_v1', 'Projected on-time terminal arrival at Ajmer Junction.')
        """, (run_id, now_iso, sched_aii, eta_aii, eta_aii, eta_aii))

        conn.commit()
        print("Successfully seeded Train 12015 Ajmer Shatabdi Express into tracker.db!")

    conn.close()

if __name__ == '__main__':
    seed_12015()
