/**
 * DelayPropagationGraph — Real-time cascading delay propagation diagram.
 * Visualizes how delay from a primary disrupted train cascades to following trains
 * at shared railway junctions.
 */
import React from 'react';
import { NetworkImpact } from '../types';
import { formatDelay, delayClass } from '../api';

interface Props {
  impact: NetworkImpact | null;
  loading?: boolean;
}

export default function DelayPropagationGraph({ impact, loading }: Props) {
  if (loading) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <p className="text-muted">Computing network cascade impact…</p>
      </div>
    );
  }

  if (!impact) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <p className="text-muted">Select an active train run to inspect delay propagation.</p>
      </div>
    );
  }

  const hasImpact = impact.affected_trains && impact.affected_trains.length > 0;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <span>🌐</span> Junction Delay Cascade Radar
        </div>
        <span className="text-xs text-muted font-mono">
          PRIMARY: TRAIN #{impact.primary_train_number} ({formatDelay(impact.primary_delay_min)})
        </span>
      </div>

      <div style={{ padding: '8px 0' }}>
        {/* Cascade Visual Node Structure */}
        <div
          style={{
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
            marginBottom: 16,
          }}
        >
          {/* Primary Source Node */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'var(--bg-panel-elevated)',
              borderLeft: '4px solid var(--rail-critical)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                Primary Disruption Source: Train #{impact.primary_train_number}
              </div>
              <div className="text-xs text-muted">
                Holding headway slots on trunk corridor
              </div>
            </div>
            <span className={`delay-badge ${delayClass(impact.primary_delay_min)}`}>
              {formatDelay(impact.primary_delay_min)}
            </span>
          </div>

          {/* Junction Arrow Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: '12px 0 12px 16px',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>│</span>
            <span>▼ Shared Railway Junctions & Signal Blocks</span>
          </div>

          {/* Downstream Affected Nodes */}
          {!hasImpact ? (
            <div
              style={{
                padding: '12px 14px',
                background: 'var(--bg-panel)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--rail-ontime)',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              ✓ No downstream trains currently in conflicting section windows. Corridor clear.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 16 }}>
              {impact.affected_trains.map((t, idx) => (
                <div
                  key={t.run_id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted font-mono">├──</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        Train #{t.train_number} — {t.train_name}
                      </div>
                      <div className="text-xs text-muted">
                        Shares {t.shared_sections} upcoming track section{t.shared_sections > 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--rail-caution)', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.82rem' }}>
                      +{t.estimated_additional_delay_min.toFixed(1)} min cascade
                    </div>
                    <div className="text-xs text-muted">
                      Current: {formatDelay(t.current_delay_min)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
