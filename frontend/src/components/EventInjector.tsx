/**
 * EventInjector — Railway Disruption Simulation & Event Injection Panel.
 * Provides 1-click realistic operational scenarios and custom event injection.
 */
import React, { useState } from 'react';
import { OperationalEvent } from '../types';
import { api } from '../api';

interface Props {
  runId: number;
  sections: { id: number; from_station: { name: string; code: string }; to_station: { name: string; code: string } }[];
  stations: { id: number; name: string; code: string }[];
  activeEvents: OperationalEvent[];
  onEventInjected: () => void;
}

const EVENT_PRESETS = [
  {
    title: '⚠️ Caution: Speed Restriction',
    desc: 'Dense fog speed restriction (50 km/h) on Mathura–Agra section',
    type: 'SPEED_RESTRICTION',
    speed: 50,
    duration: 10,
    target: 'section',
  },
  {
    title: '🛑 Unscheduled Stoppage',
    desc: 'Emergency track inspection stop (8 min) before Jaipur Junction',
    type: 'UNSCHEDULED_STOPPAGE',
    duration: 8,
    target: 'section',
  },
  {
    title: '⏱ Station Platform Delay',
    desc: 'Excess passenger boarding dwell (+4 min) at Ahmedabad Junction',
    type: 'INCREASED_DWELL',
    duration: 4,
    target: 'station',
  },
  {
    title: '🚦 Signal Failure',
    desc: 'Automated block signal interlocking failure on Palanpur section',
    type: 'SIGNAL_FAILURE',
    duration: 12,
    target: 'section',
  },
];

export default function EventInjector({
  runId,
  sections,
  stations,
  activeEvents,
  onEventInjected,
}: Props) {
  const [selectedType, setSelectedType] = useState<string>('SPEED_RESTRICTION');
  const [sectionId, setSectionId] = useState<number>(sections[0]?.id ?? 1);
  const [stationId, setStationId] = useState<number>(stations[0]?.id ?? 1);
  const [duration, setDuration] = useState<number>(8);
  const [speedLimit, setSpeedLimit] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; isError: boolean } | null>(null);

  async function injectPreset(preset: typeof EVENT_PRESETS[0]) {
    if (!runId) return;
    setLoading(true);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        run_id: runId,
        event_type: preset.type,
        severity: 'HIGH',
        duration_min: preset.duration,
        description: preset.desc,
      };

      if (preset.target === 'section') {
        payload.section_id = sections[0]?.id ?? 1;
        if (preset.type === 'SPEED_RESTRICTION') payload.speed_restriction_kmh = preset.speed;
      } else {
        payload.station_id = stations[Math.floor(stations.length / 2)]?.id ?? 1;
      }

      await api.injectEvent(payload);
      setFeedback({ msg: `✓ Disruption injected: "${preset.title}". Recalculating ETAs…`, isError: false });
      onEventInjected();
      setTimeout(() => setFeedback(null), 5000);
    } catch (e) {
      setFeedback({ msg: `Failed to inject: ${String(e)}`, isError: true });
    } finally {
      setLoading(false);
    }
  }

  async function injectCustom() {
    if (!runId) return;
    setLoading(true);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        run_id: runId,
        event_type: selectedType,
        severity: 'HIGH',
        duration_min: duration,
        description: `Custom ${selectedType.replace(/_/g, ' ')}`,
      };

      if (['SPEED_RESTRICTION', 'SIGNAL_FAILURE', 'CONGESTION', 'MAINTENANCE_BLOCK', 'UNSCHEDULED_STOPPAGE'].includes(selectedType)) {
        payload.section_id = sectionId;
        if (selectedType === 'SPEED_RESTRICTION') payload.speed_restriction_kmh = speedLimit;
      } else {
        payload.station_id = stationId;
      }

      await api.injectEvent(payload);
      setFeedback({ msg: `✓ Injected event on corridor. Dynamic ETAs updated.`, isError: false });
      onEventInjected();
      setTimeout(() => setFeedback(null), 5000);
    } catch (e) {
      setFeedback({ msg: `Failed: ${String(e)}`, isError: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleClear(id: number) {
    try {
      await api.clearEvent(id);
      onEventInjected();
    } catch (_) {}
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <span>⚡</span> Disruption Simulator & Event Injection
        </div>
        <span className="text-xs text-muted font-mono">
          SIH26028 LIVE TEST HARNESS
        </span>
      </div>

      {/* 1-Click Realistic Disruption Presets */}
      <div className="mb-4">
        <div className="text-xs text-muted mb-2 font-mono uppercase">
          1-Click Realistic Operational Presets:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {EVENT_PRESETS.map((p, idx) => (
            <button
              key={idx}
              className="btn btn-secondary btn-sm"
              onClick={() => injectPreset(p)}
              disabled={loading || !runId}
              style={{
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '10px 12px',
                border: '1px solid var(--border-default)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                {p.title}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {p.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Disruption Form */}
      <div
        style={{
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div className="text-xs text-muted mb-2 font-mono uppercase">
          Custom Disruption Parameters:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <label className="text-xs text-muted mb-1" style={{ display: 'block' }}>Event Type</label>
            <select
              className="input"
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
            >
              <option value="SPEED_RESTRICTION">Speed Restriction</option>
              <option value="UNSCHEDULED_STOPPAGE">Unscheduled Stop</option>
              <option value="INCREASED_DWELL">Excess Station Dwell</option>
              <option value="SIGNAL_FAILURE">Signal Failure</option>
              <option value="CONGESTION">Track Congestion</option>
              <option value="MAINTENANCE_BLOCK">Maintenance Block</option>
            </select>
          </div>

          {['SPEED_RESTRICTION', 'SIGNAL_FAILURE', 'CONGESTION', 'MAINTENANCE_BLOCK', 'UNSCHEDULED_STOPPAGE'].includes(selectedType) ? (
            <div>
              <label className="text-xs text-muted mb-1" style={{ display: 'block' }}>Target Track Section</label>
              <select
                className="input"
                value={sectionId}
                onChange={e => setSectionId(Number(e.target.value))}
              >
                {sections.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.from_station.code} → {s.to_station.code}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted mb-1" style={{ display: 'block' }}>Target Station</label>
              <select
                className="input"
                value={stationId}
                onChange={e => setStationId(Number(e.target.value))}
              >
                {stations.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedType === 'SPEED_RESTRICTION' && (
            <div>
              <label className="text-xs text-muted mb-1" style={{ display: 'block' }}>Speed Limit (km/h)</label>
              <input
                type="number"
                className="input"
                value={speedLimit}
                onChange={e => setSpeedLimit(Number(e.target.value))}
                min={20}
                max={100}
                step={5}
              />
            </div>
          )}

          <div>
            <label className="text-xs text-muted mb-1" style={{ display: 'block' }}>Duration (min)</label>
            <input
              type="number"
              className="input"
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              min={1}
              max={60}
            />
          </div>

          <div>
            <button
              className="btn btn-primary w-full"
              onClick={injectCustom}
              disabled={loading || !runId}
            >
              {loading ? 'Injecting…' : '⚡ Apply Event'}
            </button>
          </div>
        </div>
      </div>

      {/* Feedback message */}
      {feedback && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8rem',
            marginBottom: 12,
            background: feedback.isError ? 'var(--rail-critical-bg)' : 'var(--rail-ontime-bg)',
            color: feedback.isError ? 'var(--rail-critical)' : 'var(--rail-ontime)',
            border: `1px solid ${feedback.isError ? 'var(--rail-critical-border)' : 'var(--rail-ontime-border)'}`,
          }}
        >
          {feedback.msg}
        </div>
      )}

      {/* Active events list */}
      {activeEvents.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-2 font-mono uppercase">
            Currently Active Operational Events ({activeEvents.length}):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeEvents.map(ev => (
              <div
                key={ev.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--bg-panel-elevated)',
                  border: '1px solid var(--rail-caution-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--rail-caution)' }}>
                    ⚠ {ev.event_type.replace(/_/g, ' ')}
                    {ev.speed_restriction_kmh ? ` (${ev.speed_restriction_kmh} km/h max)` : ''}
                  </div>
                  <div className="text-xs text-muted">{ev.description}</div>
                </div>

                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleClear(ev.id)}
                  style={{ color: 'var(--rail-critical)', borderColor: 'var(--rail-critical-border)' }}
                >
                  ✕ Clear
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
