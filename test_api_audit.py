import urllib.request
import urllib.parse
import json
import time

BASE_URL = "http://127.0.0.1:8000/api/v1"

def request(method, path, data=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            content = resp.read().decode("utf-8")
            return status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        err_content = e.read().decode("utf-8")
        return e.code, err_content
    except Exception as e:
        return 0, str(e)

print("=" * 60)
print("RUNNING AUTOMATED ENDPOINT INTEGRITY AUDIT")
print("=" * 60)

endpoints = [
    ("GET", "/trains", None),
    ("GET", "/trains/1", None),
    ("GET", "/trains/1/live", None),
    ("GET", "/trains/1/predictions", None),
    ("GET", "/stations", None),
    ("GET", "/routes/1", None),
    ("GET", "/analytics/active-runs", None),
    ("GET", "/analytics/model-performance", None),
    ("GET", "/analytics/section-bottlenecks", None),
    ("GET", "/analytics/prediction-vs-reality", None),
]

passed = 0
failed = 0

for method, path, data in endpoints:
    status, res = request(method, path, data)
    if status in (200, 201):
        print(f"[PASS] {method} {path} -> HTTP {status}")
        passed += 1
    else:
        print(f"[FAIL] {method} {path} -> HTTP {status} | Error: {res}")
        failed += 1

print("\nTesting Simulation & Telemetry Flow...")
# 1. Start simulation
status, start_res = request("POST", "/simulation/start", {"train_id": 1, "origin_delay_min": 10})
if status in (200, 201):
    run_id = start_res["run_id"]
    print(f"[PASS] POST /simulation/start -> HTTP {status} (Run ID: {run_id})")
    passed += 1

    # 2. Post telemetry
    status, tel_res = request("POST", "/telemetry", {
        "run_id": run_id,
        "timestamp": "2026-09-05T09:21:00Z",
        "latitude": 28.6139,
        "longitude": 77.2090,
        "speed_kmh": 105.0,
        "distance_covered_km": 15.0,
        "cumulative_delay_min": 10.0,
        "current_section_id": 1,
        "current_station_id": 1,
        "data_source": "SIMULATED",
    })
    if status in (200, 201):
        print(f"[PASS] POST /telemetry -> HTTP {status} (Telemetry ID: {tel_res.get('id')})")
        passed += 1
    else:
        print(f"[FAIL] POST /telemetry -> HTTP {status} | Error: {tel_res}")
        failed += 1

    # Wait 1s for async prediction pipeline to finish
    time.sleep(1.0)

    # 3. Get predictions
    status, pred_res = request("GET", f"/predictions/{run_id}", None)
    if status == 200 and len(pred_res.get("predictions", [])) > 0:
        print(f"[PASS] GET /predictions/{run_id} -> HTTP 200 ({len(pred_res['predictions'])} upcoming stations calculated)")
        passed += 1
    else:
        print(f"[FAIL] GET /predictions/{run_id} -> HTTP {status} | Error: {pred_res}")
        failed += 1

    # 4. Inject disruption with integer severity
    status, ev_res = request("POST", "/simulation/events", {
        "run_id": run_id,
        "event_type": "WEATHER_FOG",
        "section_id": 1,
        "duration_min": 30,
        "speed_restriction_kmh": 50,
        "severity": 3,
        "description": "Dense fog between NDLS and MTJ",
    })
    if status in (200, 201):
        ev_id = ev_res["id"]
        print(f"[PASS] POST /simulation/events (severity=3) -> HTTP {status} (Event ID: {ev_id}, severity: {ev_res.get('severity')})")
        passed += 1

        # 5. Clear event
        status, clr_res = request("DELETE", f"/simulation/events/{ev_id}", None)
        if status == 200:
            print(f"[PASS] DELETE /simulation/events/{ev_id} -> HTTP 200 (Event cleared)")
            passed += 1
        else:
            print(f"[FAIL] DELETE /simulation/events/{ev_id} -> HTTP {status} | Error: {clr_res}")
            failed += 1
    else:
        print(f"[FAIL] POST /simulation/events -> HTTP {status} | Error: {ev_res}")
        failed += 1

    # 6. Check network impact
    status, net_res = request("GET", f"/analytics/network-impact/{run_id}", None)
    if status == 200:
        print(f"[PASS] GET /analytics/network-impact/{run_id} -> HTTP 200 (Cascade calculated)")
        passed += 1
    else:
        print(f"[FAIL] GET /analytics/network-impact/{run_id} -> HTTP {status} | Error: {net_res}")
        failed += 1

else:
    print(f"[FAIL] POST /simulation/start -> HTTP {status} | Error: {start_res}")
    failed += 1

print("=" * 60)
print(f"AUDIT SUMMARY: {passed} PASSED, {failed} FAILED")
print("=" * 60)
