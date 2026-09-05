/**
 * PredictionVsReality — Station arrival verification log.
 * Compares predicted ETA against actual historical arrivals to demonstrate continuous model accuracy.
 */
import React from 'react';
import { PredictionVsReality as ItemType } from '../types';

interface Props {
  items: ItemType[];
  loading?: boolean;
}

export default function PredictionVsReality({ items, loading }: Props) {
  if (loading) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <p className="text-muted">Loading verification records…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <span>🎯</span> Prediction vs. Reality — Continuous Verification
        </div>
        <span className="text-xs text-muted font-mono">
          HISTORICAL ARRIVAL COMPARISON LOG
        </span>
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Station</th>
              <th>Scheduled</th>
              <th>Predicted ETA</th>
              <th>Actual Arrival</th>
              <th>Model Error</th>
              <th>Accuracy</th>
              <th>Confidence Level</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const absErr = Math.abs(it.error_min);
              const isAccurate = absErr <= 2.0;

              return (
                <tr key={idx}>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{it.station_name}</div>
                    <div className="mono text-xs text-muted">{it.station_code}</div>
                  </td>
                  <td className="mono">{it.scheduled_time}</td>
                  <td className="mono" style={{ color: 'var(--rail-info)', fontWeight: 600 }}>{it.predicted_time}</td>
                  <td className="mono" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{it.actual_time}</td>
                  <td className="mono">
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontWeight: 700,
                        background: isAccurate ? 'var(--rail-ontime-bg)' : 'var(--rail-caution-bg)',
                        color: isAccurate ? 'var(--rail-ontime)' : 'var(--rail-caution)',
                        border: `1px solid ${isAccurate ? 'var(--rail-ontime-border)' : 'var(--rail-caution-border)'}`,
                      }}
                    >
                      {it.error_min > 0 ? `+${it.error_min.toFixed(1)}` : `${it.error_min.toFixed(1)}`} min
                    </span>
                  </td>
                  <td className="mono" style={{ fontWeight: 700, color: it.accuracy_pct >= 90 ? 'var(--rail-ontime)' : 'var(--text-primary)' }}>
                    {it.accuracy_pct.toFixed(1)}%
                  </td>
                  <td className="text-xs">{it.confidence_level}</td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: isAccurate ? 'var(--rail-ontime)' : 'var(--rail-caution)',
                      }}
                    >
                      {it.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
