/**
 * CoachSeatMap — High-fidelity visual 8-berth coupe & bay coach seat map.
 * Features:
 *   - Coach tabs (A1, A2, B1, B2, B3, S1, S2)
 *   - Segment-aware vacancy indicators (Confirmed, Deboarding ahead, Occupied, Blocked Quota)
 *   - Interactive berth click inspector with segment reservation history & ML confidence
 *   - 1-Click instant alert watch
 */
import React, { useState, useEffect } from 'react';
import { api } from '../api';
import type { CoachMap, CoachBrief, SeatGridItem } from '../types';

interface CoachSeatMapProps {
  trainId: number;
  trainNumber: string;
  trainName: string;
  fromStationId: number;
  toStationId: number;
  fromStationCode: string;
  toStationCode: string;
  runId?: number;
  onClose: () => void;
  onWatchSeat?: (coachCode: string, seatNumber: number) => void;
  onBookSeat?: (coachCode: string, seatNumber: number, berthType: string, coachClass: string) => void;
}

export const CoachSeatMap: React.FC<CoachSeatMapProps> = ({
  trainId,
  trainNumber,
  trainName,
  fromStationId,
  toStationId,
  fromStationCode,
  toStationCode,
  runId,
  onClose,
  onWatchSeat,
  onBookSeat,
}) => {
  const [coaches, setCoaches] = useState<CoachBrief[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<number | null>(null);
  const [coachMap, setCoachMap] = useState<CoachMap | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<SeatGridItem | null>(null);
  const [loadingCoaches, setLoadingCoaches] = useState(true);
  const [loadingMap, setLoadingMap] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load coach list
  useEffect(() => {
    let isMounted = true;
    setLoadingCoaches(true);
    api.getTrainCoaches(trainId)
      .then((data) => {
        if (!isMounted) return;
        setCoaches(data);
        if (data.length > 0) {
          setSelectedCoachId(data[0].id);
        }
        setLoadingCoaches(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(`Failed to load coaches: ${err.message}`);
        setLoadingCoaches(false);
      });
    return () => { isMounted = false; };
  }, [trainId]);

  // Load coach map when selectedCoachId changes
  useEffect(() => {
    if (!selectedCoachId) return;
    let isMounted = true;
    setLoadingMap(true);
    setSelectedSeat(null);
    api.getCoachMap(trainId, selectedCoachId, {
      from_station_id: fromStationId,
      to_station_id: toStationId,
      run_id: runId,
    })
      .then((data) => {
        if (!isMounted) return;
        setCoachMap(data);
        setLoadingMap(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(`Failed to load seat layout: ${err.message}`);
        setLoadingMap(false);
      });
    return () => { isMounted = false; };
  }, [trainId, selectedCoachId, fromStationId, toStationId, runId]);

  // Group seats by bay (8 berths per bay for 3A/SL, 6 for 2A)
  const bays: Record<number, SeatGridItem[]> = {};
  if (coachMap?.seats) {
    coachMap.seats.forEach((seat) => {
      const bay = seat.bay_number || Math.ceil(seat.seat_number / 8);
      if (!bays[bay]) bays[bay] = [];
      bays[bay].push(seat);
    });
  }

  const getStatusStyle = (status: string, isSelected: boolean) => {
    let bg = 'var(--bg-panel-elevated)';
    let border = 'var(--border-default)';
    let color = 'var(--text-secondary)';

    if (status === 'AVAILABLE') {
      bg = 'rgba(16, 185, 129, 0.15)';
      border = 'rgba(16, 185, 129, 0.5)';
      color = '#34d399';
    } else if (status === 'PREDICTED_AVAILABLE') {
      bg = 'rgba(245, 158, 11, 0.15)';
      border = 'rgba(245, 158, 11, 0.5)';
      color = '#fbbf24';
    } else if (status === 'BLOCKED_QUOTA') {
      bg = 'rgba(239, 68, 68, 0.12)';
      border = 'rgba(239, 68, 68, 0.35)';
      color = '#f87171';
    } else {
      bg = 'var(--bg-canvas)';
      border = 'var(--border-subtle)';
      color = 'var(--text-disabled)';
    }

    if (isSelected) {
      border = '#38bdf8';
      bg = 'rgba(56, 189, 248, 0.25)';
    }

    return {
      background: bg,
      border: `1px solid ${border}`,
      color: color,
      borderRadius: 'var(--radius-md)',
      padding: '6px 8px',
      cursor: 'pointer',
      textAlign: 'left' as const,
      position: 'relative' as const,
      transition: 'all 0.15s',
      boxShadow: isSelected ? '0 0 10px rgba(56, 189, 248, 0.4)' : 'none',
    };
  };

  const getBerthBadge = (type: string) => {
    switch (type) {
      case 'LOWER': return 'LB';
      case 'MIDDLE': return 'MB';
      case 'UPPER': return 'UB';
      case 'SIDE_LOWER': return 'SL';
      case 'SIDE_UPPER': return 'SU';
      default: return type.substring(0, 2);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="card animate-fadeIn"
        style={{
          width: '100%',
          maxWidth: 1040,
          maxHeight: '92vh',
          background: 'var(--bg-panel)',
          borderColor: 'rgba(56, 189, 248, 0.4)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: '14px 20px',
            background: 'var(--bg-panel-elevated)',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="mono font-bold" style={{ fontSize: '1.2rem', color: '#f1f5f9' }}>
                🚆 #{trainNumber} · {trainName}
              </span>
              <span
                className="badge"
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  fontSize: '0.75rem',
                }}
              >
                Segment: {fromStationCode} ➔ {toStationCode}
              </span>
            </div>
            <p className="text-xs text-muted" style={{ marginTop: 2 }}>
              Dynamic Segment-Aware Berth Availability · Visual 8-Berth Coupe & Aisle Matrix
            </p>
          </div>

          <button
            className="btn btn-sm btn-secondary"
            onClick={onClose}
            style={{ fontSize: '1.1rem', padding: '4px 10px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Coach Tabs Selector */}
        <div
          className="flex items-center gap-2"
          style={{
            padding: '10px 20px',
            background: 'var(--bg-canvas)',
            borderBottom: '1px solid var(--border-default)',
            overflowX: 'auto',
          }}
        >
          <span className="text-xs text-muted mono font-bold uppercase" style={{ whiteSpace: 'nowrap', marginRight: 6 }}>
            Coach Rake:
          </span>
          {loadingCoaches ? (
            <span className="text-xs text-muted">Loading coaches...</span>
          ) : (
            coaches.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCoachId(c.id)}
                className={`btn btn-sm ${selectedCoachId === c.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  fontSize: '0.78rem',
                  padding: '4px 10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <strong className="mono">{c.coach_code}</strong>
                <span
                  style={{
                    fontSize: '0.68rem',
                    background: 'rgba(0,0,0,0.3)',
                    padding: '1px 4px',
                    borderRadius: 3,
                  }}
                >
                  {c.coach_class}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Legend & Summary Bar */}
        {coachMap && (
          <div
            className="flex items-center justify-between flex-wrap gap-3"
            style={{
              padding: '10px 20px',
              background: 'var(--bg-panel-elevated)',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
            }}
          >
            {/* Legend indicators */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1">
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#10b981', display: 'inline-block' }} />
                <span>Confirmed Vacant ({coachMap.summary.available})</span>
              </div>
              <div className="flex items-center gap-1">
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} />
                <span>Predicted Deboards ({coachMap.summary.predicted_available})</span>
              </div>
              <div className="flex items-center gap-1">
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--border-strong)', display: 'inline-block' }} />
                <span className="text-muted">Occupied ({coachMap.summary.occupied})</span>
              </div>
              <div className="flex items-center gap-1">
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} />
                <span className="text-muted">Blocked/Quota ({coachMap.summary.blocked})</span>
              </div>
            </div>

            <div className="text-xs text-muted mono">
              Evaluating for: <strong style={{ color: '#38bdf8' }}>{fromStationCode} ➔ {toStationCode}</strong>
            </div>
          </div>
        )}

        {/* Coach Body Grid & Inspector Sidebar */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 20,
            display: 'grid',
            gridTemplateColumns: '1fr 300px',
            gap: 16,
          }}
        >
          {loadingMap ? (
            <div style={{ textAlign: 'center', padding: 60, gridColumn: 'span 2' }}>
              <div className="mono text-sm" style={{ color: '#38bdf8', marginBottom: 6 }}>
                Computing coach berth segment matrix...
              </div>
              <p className="text-muted text-xs">Matching passenger manifests across intermediate stops</p>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--rail-critical)' }}>
              {error}
            </div>
          ) : coachMap ? (
            /* Visual Coach Shell */
            <div
              style={{
                background: 'var(--bg-canvas)',
                border: '2px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: 16,
              }}
            >
              {/* Gangway labels */}
              <div
                className="flex items-center justify-between pb-2 mb-3 mono text-xs text-muted"
                style={{ borderBottom: '1px solid var(--border-subtle)', textTransform: 'uppercase' }}
              >
                <span>← Gangway / Door</span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                  Coach {coachMap.coach_code} ({coachMap.coach_class} · {coachMap.total_seats} Berths)
                </span>
                <span>Restroom / Door →</span>
              </div>

              {/* Bays grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {Object.entries(bays).map(([bayNum, baySeats]) => {
                  const mainSeats = baySeats.filter((s) => !s.berth_type.startsWith('SIDE'));
                  const sideSeats = baySeats.filter((s) => s.berth_type.startsWith('SIDE'));

                  return (
                    <div
                      key={bayNum}
                      style={{
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        padding: 10,
                      }}
                    >
                      <div
                        className="flex items-center justify-between mb-2 text-xs text-muted mono"
                        style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}
                      >
                        <span>Bay #{bayNum}</span>
                        <span>Coupe</span>
                      </div>

                      {/* Main 6 Berths (3 on Left, 3 on Right) */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                        {mainSeats.map((seat) => (
                          <button
                            key={seat.seat_id}
                            style={getStatusStyle(seat.segment_status, selectedSeat?.seat_id === seat.seat_id)}
                            onClick={() => setSelectedSeat(seat)}
                          >
                            <div className="flex items-center justify-between">
                              <strong className="mono" style={{ fontSize: '0.82rem' }}>#{seat.seat_number}</strong>
                              <span
                                className="mono"
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '1px 3px',
                                  background: 'rgba(0,0,0,0.4)',
                                  borderRadius: 2,
                                  fontWeight: 700,
                                }}
                              >
                                {getBerthBadge(seat.berth_type)}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: '0.68rem',
                                marginTop: 2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {seat.status_label}
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Aisle Divider */}
                      <div
                        style={{
                          borderTop: '1px dashed var(--border-strong)',
                          margin: '6px 0',
                          textAlign: 'center',
                          fontSize: '0.6rem',
                          color: 'var(--text-disabled)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                        }}
                      >
                        Aisle
                      </div>

                      {/* Side 2 Berths (Side Lower, Side Upper) */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {sideSeats.map((seat) => (
                          <button
                            key={seat.seat_id}
                            style={getStatusStyle(seat.segment_status, selectedSeat?.seat_id === seat.seat_id)}
                            onClick={() => setSelectedSeat(seat)}
                          >
                            <div className="flex items-center justify-between">
                              <strong className="mono" style={{ fontSize: '0.82rem' }}>#{seat.seat_number}</strong>
                              <span
                                className="mono"
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '1px 3px',
                                  background: 'rgba(0,0,0,0.4)',
                                  borderRadius: 2,
                                  fontWeight: 700,
                                }}
                              >
                                {getBerthBadge(seat.berth_type)}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: '0.68rem',
                                marginTop: 2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {seat.status_label}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Right Sidebar: Berth Inspector */}
          <div
            style={{
              background: 'var(--bg-panel-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            {selectedSeat ? (
              <div>
                <div className="pb-2 mb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <div className="flex items-center justify-between">
                    <h3 style={{ fontSize: '1.25rem', color: '#f1f5f9' }}>
                      Seat #{selectedSeat.seat_number}
                    </h3>
                    <span
                      className="badge"
                      style={{
                        background: 'rgba(56, 189, 248, 0.2)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                      }}
                    >
                      {selectedSeat.coach_code} · {selectedSeat.berth_type}
                    </span>
                  </div>
                  <p className="text-xs text-muted" style={{ marginTop: 2 }}>
                    Bay #{selectedSeat.bay_number} {selectedSeat.is_window ? '· Window Berth' : ''}
                  </p>
                </div>

                {/* Status Callout Box */}
                <div
                  style={{
                    background:
                      selectedSeat.segment_status === 'AVAILABLE'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : selectedSeat.segment_status === 'PREDICTED_AVAILABLE'
                        ? 'rgba(245, 158, 11, 0.15)'
                        : 'var(--bg-canvas)',
                    border: `1px solid ${
                      selectedSeat.segment_status === 'AVAILABLE'
                        ? 'rgba(16, 185, 129, 0.4)'
                        : selectedSeat.segment_status === 'PREDICTED_AVAILABLE'
                        ? 'rgba(245, 158, 11, 0.4)'
                        : 'var(--border-default)'
                    }`,
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    marginBottom: 12,
                  }}
                >
                  <div className="text-xs text-muted mono uppercase">Segment Status</div>
                  <div className="font-bold" style={{ fontSize: '0.95rem', color: '#f1f5f9', marginTop: 2 }}>
                    {selectedSeat.status_label}
                  </div>
                  <div className="text-xs text-muted mono" style={{ marginTop: 4 }}>
                    ML Confidence: {(selectedSeat.confidence * 100).toFixed(0)}%
                  </div>
                </div>

                {/* Deboarding Insight */}
                {selectedSeat.deboard_explanation && (
                  <div
                    style={{
                      background: 'rgba(6, 182, 212, 0.12)',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 12px',
                      fontSize: '0.75rem',
                      color: '#a5f3fc',
                      marginBottom: 12,
                    }}
                  >
                    <strong style={{ display: 'block', color: '#22d3ee', marginBottom: 2 }}>
                      💡 Segment Turnover Insight:
                    </strong>
                    {selectedSeat.deboard_explanation}
                  </div>
                )}

                {/* Segment Booking Timeline */}
                <div style={{ marginBottom: 16 }}>
                  <div className="text-xs text-muted mono uppercase font-bold mb-2">
                    Segment Reservation Matrix:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedSeat.segment_history && selectedSeat.segment_history.length > 0 ? (
                      selectedSeat.segment_history.map((seg, idx) => (
                        <div
                          key={idx}
                          className="mono"
                          style={{
                            padding: '6px 8px',
                            background: 'var(--bg-canvas)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.72rem',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {seg}
                        </div>
                      ))
                    ) : (
                      <div className="text-muted text-xs italic">
                        Unreserved across complete corridor.
                      </div>
                    )}
                  </div>
                </div>

                {/* Action CTA */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(selectedSeat.segment_status === 'AVAILABLE' || selectedSeat.segment_status === 'PREDICTED_AVAILABLE') && onBookSeat && (
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', fontSize: '0.82rem', padding: '9px 12px', fontWeight: 700 }}
                      onClick={() => {
                        onBookSeat(
                          selectedSeat.coach_code,
                          selectedSeat.seat_number,
                          selectedSeat.berth_type,
                          coachMap?.coach_class || '3A'
                        );
                      }}
                    >
                      🎫 Book This Berth (₹1,140)
                    </button>
                  )}
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', fontSize: '0.78rem', padding: '6px 12px', fontWeight: 600 }}
                    onClick={() => {
                      if (onWatchSeat) onWatchSeat(selectedSeat.coach_code, selectedSeat.seat_number);
                    }}
                  >
                    🔔 Watch This Berth
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-disabled)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 6 }}>💺</div>
                <div className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
                  Click any berth to inspect
                </div>
                <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                  View segment booking status, intermediate deboarding point, and ML confidence metrics.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Disclaimer */}
        <div
          className="flex items-center justify-between text-xs text-muted"
          style={{
            padding: '10px 20px',
            background: 'var(--bg-canvas)',
            borderTop: '1px solid var(--border-default)',
          }}
        >
          <span>⚠️ SIMULATED INVENTORY DATA · SIH26028 Prototype</span>
          <span>Official booking requires IRCTC / PRS terminal confirmation</span>
        </div>
      </div>
    </div>
  );
};
