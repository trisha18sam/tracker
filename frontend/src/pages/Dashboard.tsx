/**
 * Dashboard (Operations Control Center) — Railway Traffic Control Room View.
 * Real-time fleet monitoring, track occupancy inspection, filtering,
 * junction delay cascade radar, and section anomaly alerts.
 */
import React, { useState, useEffect, useRef } from 'react';
import { ActiveRunSummary, NetworkImpact, TrainDetail, Station, RouteSection } from '../types';
import { api, formatDelay, delayClass, formatTime } from '../api';
import RouteMap from '../components/RouteMap';
import DelayPropagationGraph from '../components/DelayPropagationGraph';

export default function Dashboard() {
  const [runs, setRuns] = useState<ActiveRunSummary[]>([]);
  const [trainDetail, setTrainDetail] = useState<TrainDetail | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [networkImpact, setNetworkImpact] = useState<NetworkImpact | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [impactLoading, setImpactLoading] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActiveRuns = async () => {
    try {
      const data = await api.getActiveRuns();
      setRuns(data);
      if (data.length > 0 && !selectedRunId) {
        setSelectedRunId(data[0].run_id);
      }
    } catch (_) {}
  };

  useEffect(() => {
    Promise.all([
      fetchActiveRuns(),
      api.getTrain(1).then(setTrainDetail).catch(() => null),
    ]).finally(() => setLoading(false));

    refreshTimerRef.current = setInterval(fetchActiveRuns, 4000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  // Fetch network delay cascade whenever selected run changes
  useEffect(() => {
    if (selectedRunId) {
      setImpactLoading(true);
      api.getNetworkImpact(selectedRunId)
        .then(setNetworkImpact)
        .catch(() => setNetworkImpact(null))
        .finally(() => setImpactLoading(false));

      const active = runs.find(r => r.run_id === selectedRunId);
      if (active) {
        api.getTrain(active.train_id).then(setTrainDetail).catch(() => {});
      }
    }
  }, [selectedRunId, runs]);

  // Metric counts
  const onTimeCount = runs.filter(r => r.current_delay_min < 5).length;
  const cautionCount = runs.filter(r => r.current_delay_min >= 5 && r.current_delay_min < 15).length;
  const criticalCount = runs.filter(r => r.current_delay_min >= 15).length;
  const totalEvents = runs.reduce((acc, r) => acc + (r.active_events?.length || 0), 0);

  // Filtered runs
  const filteredRuns = runs.filter(r => {
    const matchesSearch =
      r.train_number.toLowerCase().includes(searchFilter.toLowerCase()) ||
      r.train_name.toLowerCase().includes(searchFilter.toLowerCase());

    if (!matchesSearch) return false;
    if (severityFilter === 'ON_TIME') return r.current_delay_min < 5;
    if (severityFilter === 'CAUTION') return r.current_delay_min >= 5 && r.current_delay_min < 15;
    if (severityFilter === 'CRITICAL') return r.current_delay_min >= 15;
    return true;
  });

  const selectedRun = runs.find(r => r.run_id === selectedRunId) || runs[0];
  const sections = trainDetail?.route?.sections ?? [];
  const stations = sections.map(s => s.to_station);
  const originStation = trainDetail?.route?.origin_station;
  const allStations = originStation ? [originStation, ...stations] : stations;

  return (
    <div className="page-container">
      {/* Control Room Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="mb-1">⚙️ Central Railway Traffic Control & Operations</h1>
          <p>Trunk Corridor Live Telemetry, Track Occupancy & Dynamic Cascading Headway Radar</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchActiveRuns}>
            ↻ Sync Telemetry
          </button>
          <span className="telemetry-status-pill live">
            <span className="live-pulse-dot" />
            CONTROL NETWORK ACTIVE
          </span>
        </div>
      </div>

      {/* KPI Status Banner */}
      <div className="stat-grid mb-6">
        <div className="stat-tile">
          <div className="stat-tile-label">Monitored Fleet</div>
          <div className="stat-tile-value">{runs.length}</div>
          <div className="stat-tile-sub">Active coaching trains</div>
        </div>

        <div className="stat-tile">
          <div className="stat-tile-label">On Schedule</div>
          <div className="stat-tile-value" style={{ color: 'var(--rail-ontime)' }}>
            {onTimeCount}
          </div>
          <div className="stat-tile-sub">&lt; 5 min schedule adherence</div>
        </div>

        <div className="stat-tile">
          <div className="stat-tile-label">Caution / Minor Delay</div>
          <div className="stat-tile-value" style={{ color: 'var(--rail-caution)' }}>
            {cautionCount}
          </div>
          <div className="stat-tile-sub">5 – 15 min delay</div>
        </div>

        <div className="stat-tile">
          <div className="stat-tile-label">Critical Disruption</div>
          <div className="stat-tile-value" style={{ color: 'var(--rail-critical)' }}>
            {criticalCount}
          </div>
          <div className="stat-tile-sub">&gt; 15 min cascading risk</div>
        </div>

        <div className="stat-tile">
          <div className="stat-tile-label">Active Restrictions</div>
          <div className="stat-tile-value" style={{ color: totalEvents > 0 ? 'var(--rail-caution)' : 'var(--text-muted)' }}>
            {totalEvents}
          </div>
          <div className="stat-tile-sub">Track speed / signal blocks</div>
        </div>
      </div>

      {/* Map & Corridor Layout (Top Row) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Live GIS Track Map */}
        <div>
          <div className="card-title mb-2">
            <span>🗺️</span> Delhi–Mumbai Trunk Corridor GIS Radar
          </div>
          <RouteMap
            stations={allStations}
            sections={sections}
            activeEvents={selectedRun?.active_events?.map(e => ({
              id: 1,
              run_id: selectedRun.run_id,
              event_type: e.event_type,
              severity: e.severity,
              description: e.description,
              start_time: new Date().toISOString(),
            })) || []}
            trainLat={selectedRun?.latest_lat}
            trainLon={selectedRun?.latest_lon}
            trainNumber={selectedRun?.train_number}
            delayMin={selectedRun?.current_delay_min}
            speedKmh={selectedRun?.latest_speed_kmh}
          />
        </div>

        {/* Selected Train Inspector Panel */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="card-header">
              <div className="card-title">
                <span>🚆</span> Selected Train Track Inspector
              </div>
              <span className="mono text-xs text-muted">
                {selectedRun ? `RUN #${selectedRun.run_id}` : 'NO SELECTION'}
              </span>
            </div>

            {selectedRun ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 style={{ fontSize: '1.15rem' }}>
                      {selectedRun.train_name}
                    </h3>
                    <div className="mono text-xs text-muted">
                      #{selectedRun.train_number} · {selectedRun.train_type}
                    </div>
                  </div>
                  <span className={`delay-badge ${delayClass(selectedRun.current_delay_min)}`}>
                    {formatDelay(selectedRun.current_delay_min)}
                  </span>
                </div>

                <div className="stat-grid mb-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="stat-tile" style={{ padding: '10px 12px' }}>
                    <div className="stat-tile-label">Current Velocity</div>
                    <div className="stat-tile-value" style={{ fontSize: '1.2rem' }}>
                      {selectedRun.latest_speed_kmh?.toFixed(0) ?? '—'}
                      <span style={{ fontSize: '0.75rem', fontWeight: 400 }}> km/h</span>
                    </div>
                  </div>

                  <div className="stat-tile" style={{ padding: '10px 12px' }}>
                    <div className="stat-tile-label">Telemetry Feed</div>
                    <div className="stat-tile-value" style={{ fontSize: '0.95rem', color: 'var(--rail-info)' }}>
                      {selectedRun.data_source}
                    </div>
                  </div>
                </div>

                {/* Active Restrictions on this train */}
                {selectedRun.active_events && selectedRun.active_events.length > 0 ? (
                  <div style={{ background: 'var(--rail-caution-bg)', border: '1px solid var(--rail-caution-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 12 }}>
                    <div className="text-xs" style={{ color: 'var(--rail-caution)', fontWeight: 700, marginBottom: 4 }}>
                      ⚠️ Active Section Restrictions:
                    </div>
                    {selectedRun.active_events.map((ev, i) => (
                      <div key={i} className="text-xs text-secondary">
                        • {ev.event_type.replace(/_/g, ' ')}: {ev.description}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 12, fontSize: '0.78rem', color: 'var(--rail-ontime)' }}>
                    ✓ No active speed restrictions or stoppage flags on this train.
                  </div>
                )}

                <div className="text-xs text-muted">
                  Last Telemetry Fix: <strong className="mono text-secondary">{selectedRun.last_update ? formatTime(selectedRun.last_update) : 'Live'}</strong>
                </div>
              </div>
            ) : (
              <p className="text-muted">Select an active train run below to view telemetry and track diagnostics.</p>
            )}
          </div>

          <div style={{ paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
            <a href="/demo" className="btn btn-secondary btn-sm w-full">
              🎯 Test Disruption in Demo Hub
            </a>
          </div>
        </div>
      </div>

      {/* High-Density Fleet Monitor Table */}
      <div className="card mb-6">
        <div className="card-header">
          <div className="card-title">
            <span>📋</span> Active Train Fleet Status & Dispatch Log ({filteredRuns.length})
          </div>

          {/* Table Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="text"
              className="input"
              placeholder="Filter by train number / name…"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              style={{ width: 220, padding: '5px 10px', fontSize: '0.8rem' }}
            />

            <select
              className="input"
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              style={{ width: 140, padding: '5px 10px', fontSize: '0.8rem' }}
            >
              <option value="ALL">All Severities</option>
              <option value="ON_TIME">On Time (&lt; 5m)</option>
              <option value="CAUTION">Caution (5–15m)</option>
              <option value="CRITICAL">Critical (&gt; 15m)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-muted text-center" style={{ padding: 24 }}>Loading active fleet telemetry…</p>
        ) : filteredRuns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
            No trains match the selected filters.
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Train</th>
                  <th>Service Type</th>
                  <th>Schedule Adherence</th>
                  <th>Speed</th>
                  <th>Operational Alerts</th>
                  <th>Data Source</th>
                  <th>Last Update</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map(r => {
                  const isSelected = selectedRunId === r.run_id;
                  return (
                    <tr
                      key={r.run_id}
                      style={isSelected ? { backgroundColor: 'var(--bg-panel-elevated)', borderLeft: '3px solid var(--rail-info)' } : {}}
                    >
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          #{r.train_number}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {r.train_name}
                        </div>
                      </td>
                      <td>
                        <span className="mono text-xs" style={{ background: 'var(--bg-canvas)', padding: '2px 6px', borderRadius: 3 }}>
                          {r.train_type}
                        </span>
                      </td>
                      <td>
                        <span className={`delay-badge ${delayClass(r.current_delay_min)}`}>
                          {formatDelay(r.current_delay_min)}
                        </span>
                      </td>
                      <td className="mono">{r.latest_speed_kmh?.toFixed(0) ?? '—'} km/h</td>
                      <td>
                        {r.active_events && r.active_events.length > 0 ? (
                          <span style={{ color: 'var(--rail-caution)', fontWeight: 700, fontSize: '0.8rem' }}>
                            ⚠️ {r.active_events.length} event{r.active_events.length > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--rail-ontime)', fontSize: '0.8rem' }}>Normal</span>
                        )}
                      </td>
                      <td className="mono text-xs text-muted">{r.data_source}</td>
                      <td className="mono text-xs text-muted">{r.last_update ? formatTime(r.last_update) : '—'}</td>
                      <td>
                        <button
                          className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setSelectedRunId(r.run_id)}
                        >
                          {isSelected ? 'Inspecting' : 'Inspect ↗'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cascading Junction Delay Propagation Radar */}
      <div className="mb-6">
        <DelayPropagationGraph impact={networkImpact} loading={impactLoading} />
      </div>
    </div>
  );
}
