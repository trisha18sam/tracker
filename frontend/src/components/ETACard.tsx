/**
 * ETACard — Individual station prediction card with Scheduled vs Predicted ETA,
 * prediction range, confidence score, and natural language factor explainability.
 */
import React, { useState } from 'react';
import { ETAPrediction } from '../types';
import { formatTime, formatDelay, delayClass, confidenceColor } from '../api';

interface Props {
  prediction: ETAPrediction;
  stopNumber: number;
  highlight?: boolean;
}

export default function ETACard({ prediction: p, stopNumber, highlight }: Props) {
  const [expanded, setExpanded] = useState(false);
  const delay = p.predicted_delay_min;
  const dClass = delayClass(delay);

  const confidencePct = Math.round((p.confidence_score ?? 0.85) * 100);
  const confColor = confidenceColor(p.confidence_score);

  return (
    <div className={`eta-card ${highlight ? 'highlight' : ''}`}>
      {/* Header: Station Name & Status Badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="mono text-xs text-muted" style={{ background: 'var(--bg-canvas)', padding: '2px 6px', borderRadius: 3, border: '1px solid var(--border-subtle)' }}>
            #{stopNumber}
          </span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              {p.station.name}
            </div>
            <div className="mono text-xs text-muted">
              CODE: {p.station.code} {p.station.is_junction ? '· JUNCTION' : ''}
            </div>
          </div>
        </div>

        <span className={`delay-badge ${dClass}`}>
          {delay <= -1 ? '▲ Early' : delay < 5 ? '✓ On Time' : '▼ Late'} {formatDelay(delay)}
        </span>
      </div>

      {/* Primary 3-Column Time Grid */}
      <div className="eta-times-grid">
        <div className="eta-time-col">
          <div className="eta-time-label">Scheduled</div>
          <div className="eta-time-value scheduled">{formatTime(p.scheduled_eta)}</div>
        </div>

        <div className="eta-time-col">
          <div className="eta-time-label" style={{ color: 'var(--rail-info)' }}>Dynamic Predicted</div>
          <div className="eta-time-value" style={{ color: delay > 5 ? 'var(--rail-caution)' : 'var(--rail-ontime)' }}>
            {formatTime(p.predicted_eta)}
          </div>
          {p.lower_bound_eta && (
            <div className="eta-range-pill mt-1">
              Range: {formatTime(p.lower_bound_eta)}–{formatTime(p.upper_bound_eta)}
            </div>
          )}
        </div>

        <div className="eta-time-col">
          <div className="eta-time-label">Static Timetable</div>
          <div className="eta-time-value text-muted" style={{ fontSize: '0.9rem' }}>
            {formatTime(p.baseline1_eta || p.scheduled_eta)}
          </div>
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="confidence-bar-wrap mt-2">
        <span className="text-xs text-muted">Confidence:</span>
        <div className="confidence-track">
          <div
            className="confidence-fill"
            style={{ width: `${confidencePct}%`, backgroundColor: confColor }}
          />
        </div>
        <span className="mono" style={{ color: confColor, fontWeight: 700 }}>
          {confidencePct}%
        </span>
      </div>

      {/* Expandable Explanation Drawer */}
      {p.prediction_factors && p.prediction_factors.length > 0 && (
        <button
          className="btn btn-ghost btn-sm mt-2 w-full"
          onClick={() => setExpanded(!expanded)}
          style={{ justifyContent: 'space-between', padding: '5px 10px' }}
        >
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {expanded ? '▲ Hide Factor Analysis' : '▼ Why did this ETA change?'}
          </span>
          <span className="mono text-xs text-muted">
            {p.prediction_factors.length} FACTOR{p.prediction_factors.length > 1 ? 'S' : ''}
          </span>
        </button>
      )}

      {expanded && p.prediction_factors && (
        <div className="factor-list">
          {p.prediction_factors.map((f, i) => {
            const isLate = f.delta_min > 0;
            return (
              <div key={i} className="factor-row">
                <span className={`factor-delta ${isLate ? 'late' : 'early'}`}>
                  {isLate ? '+' : ''}{f.delta_min.toFixed(1)} min
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  {f.description}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
