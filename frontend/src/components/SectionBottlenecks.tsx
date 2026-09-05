/**
 * SectionBottlenecks — Route section delay vulnerability and bottleneck intelligence.
 * Computed from real historical journey data across all route sections.
 */
import React from 'react';
import { SectionBottleneck } from '../types';

interface Props {
  bottlenecks: SectionBottleneck[];
  loading?: boolean;
}

export default function SectionBottlenecks({ bottlenecks, loading }: Props) {
  if (loading) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <p className="text-muted">Analyzing section bottlenecks…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <span>⚠️</span> Route Section Bottleneck & Delay Vulnerability Intelligence
        </div>
        <span className="text-xs text-muted font-mono">
          RANKED BY HISTORICAL DELAY VARIANCE
        </span>
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Section Corridor</th>
              <th>Distance</th>
              <th>Speed Limit</th>
              <th>Hist Avg Time</th>
              <th>Std Dev (Variance)</th>
              <th>Typical P10–P90 Range</th>
              <th>Vulnerability Score</th>
            </tr>
          </thead>
          <tbody>
            {bottlenecks.map((sec) => {
              const isHighRisk = sec.delay_risk_score > 40;
              const isMediumRisk = sec.delay_risk_score > 25;

              return (
                <tr key={sec.section_id}>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {sec.from_station_name} → {sec.to_station_name}
                    </div>
                    <div className="mono text-xs text-muted">
                      {sec.from_station_code} → {sec.to_station_code}
                    </div>
                  </td>
                  <td className="mono">{sec.distance_km} km</td>
                  <td className="mono">{sec.max_speed_kmh} km/h</td>
                  <td className="mono">
                    <strong>{sec.hist_avg_travel_time_min} min</strong>
                    <div className="text-xs text-muted">Sched: {sec.scheduled_travel_time_min} min</div>
                  </td>
                  <td className="mono" style={{ color: isHighRisk ? 'var(--rail-critical)' : 'var(--text-secondary)' }}>
                    ±{sec.hist_std_dev_min} min
                  </td>
                  <td className="mono text-xs">
                    {sec.hist_p10_min} – {sec.hist_p90_min} min
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          width: 44,
                          height: 6,
                          background: 'var(--border-default)',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, sec.delay_risk_score)}%`,
                            height: '100%',
                            background: isHighRisk
                              ? 'var(--rail-critical)'
                              : isMediumRisk
                              ? 'var(--rail-caution)'
                              : 'var(--rail-ontime)',
                          }}
                        />
                      </div>
                      <span
                        className="mono"
                        style={{
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          color: isHighRisk
                            ? 'var(--rail-critical)'
                            : isMediumRisk
                            ? 'var(--rail-caution)'
                            : 'var(--rail-ontime)',
                        }}
                      >
                        {sec.delay_risk_score.toFixed(0)}/100
                      </span>
                    </div>
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
