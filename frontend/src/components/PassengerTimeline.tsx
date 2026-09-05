/**
 * PassengerTimeline — Visual milestone tracker for the entire journey.
 * Clearly distinguishes Departed, Current Position, Next Station, and Upcoming Stations.
 */
import React from 'react';
import { ETAPrediction, ScheduledStop, Station } from '../types';
import { formatTime, formatDelay, delayClass } from '../api';

interface Props {
  stops: ScheduledStop[];
  predictions: ETAPrediction[];
  currentStationId?: number;
  currentDelayMin: number;
  currentSpeedKmh?: number;
}

export default function PassengerTimeline({
  stops,
  predictions,
  currentStationId,
  currentDelayMin,
  currentSpeedKmh,
}: Props) {
  // Map predictions by station ID for quick lookup
  const predMap = new Map<number, ETAPrediction>();
  predictions.forEach(p => predMap.set(p.station_id, p));

  // Determine which stations have been passed vs upcoming
  // Upcoming stations are those present in the predictions list
  const upcomingStationIds = new Set(predictions.map(p => p.station_id));

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          Journey Milestone Timeline
        </div>
        <span className="text-xs text-muted font-mono">
          {stops.length} STOPS · {predictions.length} REMAINING
        </span>
      </div>

      <div style={{ position: 'relative', paddingLeft: 24, margin: '8px 0' }}>
        {/* Continuous background track line */}
        <div
          style={{
            position: 'absolute',
            left: 7,
            top: 14,
            bottom: 14,
            width: 2,
            background: 'var(--border-default)',
            zIndex: 1,
          }}
        />

        {stops.map((stop, idx) => {
          const isPassed = !upcomingStationIds.has(stop.station.id);
          const isNext = predictions[0]?.station_id === stop.station.id;
          const pred = predMap.get(stop.station.id);
          const schedTime = stop.arrival_time_str || stop.departure_time_str || '—';

          // Node status styling
          let nodeColor = 'var(--text-muted)';
          let nodeBg = 'var(--bg-panel)';
          let nodeBorder = 'var(--border-strong)';
          let statusText = 'Scheduled';

          if (isPassed) {
            nodeColor = 'var(--rail-ontime)';
            nodeBg = 'var(--rail-ontime)';
            nodeBorder = 'var(--rail-ontime)';
            statusText = 'Departed';
          } else if (isNext) {
            nodeColor = 'var(--rail-info)';
            nodeBg = 'var(--rail-info)';
            nodeBorder = '#ffffff';
            statusText = 'NEXT ARRIVAL';
          }

          return (
            <div
              key={stop.id || idx}
              style={{
                position: 'relative',
                marginBottom: 16,
                padding: isNext ? '12px 14px' : '6px 0',
                background: isNext ? 'var(--bg-panel-elevated)' : 'transparent',
                borderRadius: isNext ? 'var(--radius-md)' : '0',
                border: isNext ? '1px solid var(--rail-info-border)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Timeline Bullet Node */}
              <div
                style={{
                  position: 'absolute',
                  left: isNext ? -22 : -21,
                  top: isNext ? 18 : 10,
                  width: isNext ? 14 : 10,
                  height: isNext ? 14 : 10,
                  borderRadius: '50%',
                  backgroundColor: nodeBg,
                  border: `2px solid ${nodeBorder}`,
                  zIndex: 2,
                  boxShadow: isNext ? '0 0 10px rgba(56, 189, 248, 0.6)' : 'none',
                }}
              />

              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span style={{ fontWeight: isNext ? 800 : 600, fontSize: isNext ? '0.95rem' : '0.85rem', color: isPassed ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                      {stop.station.name}
                    </span>
                    <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-canvas)', padding: '1px 4px', borderRadius: 2 }}>
                      {stop.station.code}
                    </span>
                    {stop.station.is_junction && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--rail-info)', fontWeight: 700, textTransform: 'uppercase' }}>
                        JN
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-muted mt-1 flex items-center gap-3">
                    <span>Sched: <strong className="mono text-secondary">{schedTime}</strong></span>
                    {isPassed && (
                      <span style={{ color: 'var(--rail-ontime)', fontWeight: 600 }}>✓ Departed on schedule</span>
                    )}
                    {pred && (
                      <span>Pred: <strong className="mono" style={{ color: pred.predicted_delay_min > 5 ? 'var(--rail-caution)' : 'var(--rail-ontime)' }}>{formatTime(pred.predicted_eta)}</strong> ({formatDelay(pred.predicted_delay_min)})</span>
                    )}
                  </div>
                </div>

                {isNext && (
                  <div style={{ textAlign: 'right' }}>
                    <span className={`delay-badge ${delayClass(pred?.predicted_delay_min ?? currentDelayMin)}`}>
                      {formatDelay(pred?.predicted_delay_min ?? currentDelayMin)}
                    </span>
                    {pred?.lower_bound_eta && (
                      <div className="mono text-xs text-muted mt-1">
                        Est: {formatTime(pred.lower_bound_eta)}–{formatTime(pred.upper_bound_eta)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
