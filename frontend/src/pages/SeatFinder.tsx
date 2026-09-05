/**
 * SeatFinder — Last-Minute Seat & Berth Discovery System (SIH26028).
 * Dynamic segment-aware availability, predicted intermediate deboard vacancies,
 * live XGBoost ETA integration, interactive coach seat maps, and 1-click disruption simulator.
 */
import React, { useState, useEffect } from 'react';
import { api } from '../api';
import type {
  Station,
  SeatSearchResult,
  SeatOperationsAnalytics,
  SeatWatch,
} from '../types';
import { CoachSeatMap } from '../components/CoachSeatMap';
import { BookingModal } from '../components/BookingModal';
import { useAuth } from '../context/AuthContext';

export const SeatFinder: React.FC = () => {
  const { user, openAuthModal } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [fromStationId, setFromStationId] = useState<number>(1); // NDLS (1)
  const [toStationId, setToStationId] = useState<number>(5);   // JP (5)
  const [travelDate, setTravelDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [coachClass, setCoachClass] = useState<string>('');
  const [berthType, setBerthType] = useState<string>('');

  const [results, setResults] = useState<SeatSearchResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searched, setSearched] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Booking Modal state
  const [bookingData, setBookingData] = useState<{
    trainNumber: string;
    trainName: string;
    fromStation: string;
    toStation: string;
    travelDate: string;
    coachClass: string;
    coachCode?: string;
    seatNumber?: number;
    berthType?: string;
  } | null>(null);

  // Coach Map Modal state
  const [activeCoachMap, setActiveCoachMap] = useState<{
    trainId: number;
    trainNumber: string;
    trainName: string;
    fromStationId: number;
    toStationId: number;
    fromStationCode: string;
    toStationCode: string;
    runId?: number;
  } | null>(null);

  // Simulator state
  const [simTrainRunId, setSimTrainRunId] = useState<number>(650);
  const [simCoachCode, setSimCoachCode] = useState<string>('B2');
  const [simSeatNumber, setSimSeatNumber] = useState<number>(18);
  const [simLoading, setSimLoading] = useState<boolean>(false);
  const [simMessage, setSimMessage] = useState<string | null>(null);

  // Operations Analytics state
  const [analytics, setAnalytics] = useState<SeatOperationsAnalytics | null>(null);

  // Seat Watches state
  const sessionToken =
    'user_session_' +
    (localStorage.getItem('seat_session_id') ||
      Math.random().toString(36).substring(2, 9));
  const [watches, setWatches] = useState<SeatWatch[]>([]);
  const [watchNotice, setWatchNotice] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('seat_session_id', sessionToken);
    loadStations();
    loadAnalytics();
    loadWatches();
  }, []);

  const loadStations = async () => {
    try {
      const data = await api.getStations();
      setStations(data);
      if (data.length >= 2) {
        setFromStationId(1);
        setToStationId(5);
      }
    } catch (err: any) {
      console.error('Failed to load stations', err);
    }
  };

  const loadAnalytics = async () => {
    try {
      const data = await api.getSeatOperationsAnalytics();
      setAnalytics(data);
    } catch (err: any) {
      console.error('Failed to load seat analytics', err);
    }
  };

  const loadWatches = async () => {
    try {
      const data = await api.getSeatWatches(sessionToken);
      setWatches(data);
    } catch (err: any) {
      console.error('Failed to load watches', err);
    }
  };

  const handleSearch = async (overrideFrom?: number, overrideTo?: number) => {
    const fId = overrideFrom ?? fromStationId;
    const tId = overrideTo ?? toStationId;

    if (fId === tId) {
      setError('Origin and Destination stations must be different.');
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const data = await api.searchSeats({
        from_station_id: fId,
        to_station_id: tId,
        travel_date: travelDate,
        coach_class: coachClass || undefined,
        berth_type: berthType || undefined,
      });
      setResults(data);
    } catch (err: any) {
      setError(`Search failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Perform initial search when stations load
  useEffect(() => {
    if (stations.length > 0 && !searched) {
      handleSearch(1, 5);
    }
  }, [stations]);

  const handleSetWatch = async (
    trainId: number,
    preferredClass?: string,
    preferredBerth?: string
  ) => {
    const proceedWithWatch = async () => {
      try {
        await api.watchSeat({
          session_token: sessionToken,
          train_id: trainId,
          from_station_id: fromStationId,
          to_station_id: toStationId,
          travel_date: travelDate,
          preferred_class: preferredClass,
          preferred_berth: preferredBerth,
        });
        setWatchNotice(
          `🔔 Berth vacancy watch active: You will receive instant notifications when vacant berths free up on this segment!`
        );
        loadWatches();
        setTimeout(() => setWatchNotice(null), 5000);
      } catch (err: any) {
        setWatchNotice(`Failed to set alert: ${err.message}`);
        setTimeout(() => setWatchNotice(null), 5000);
      }
    };

    if (!user.authenticated) {
      openAuthModal({
        title: 'Watch Berth Vacancies',
        subtitle: 'Sign in to create personalized berth availability alerts.',
        buttonText: 'Activate Watch Alert',
        contextMessage: 'Sign in to monitor real-time intermediate deboard vacancies and last-minute cancellations on this segment.',
        onSuccess: proceedWithWatch,
      });
    } else {
      proceedWithWatch();
    }
  };

  const handleInitiateBooking = (
    train: SeatSearchResult,
    preferredClass?: string,
    coachCode?: string,
    seatNumber?: number,
    berthType?: string
  ) => {
    const selectedCls =
      preferredClass ||
      (train.classes.length > 0 ? train.classes[0].coach_class : '3A');

    const proceedWithBooking = () => {
      setBookingData({
        trainNumber: train.train_number,
        trainName: train.train_name,
        fromStation: `${train.from_station.name} (${train.from_station.code})`,
        toStation: `${train.to_station.name} (${train.to_station.code})`,
        travelDate: travelDate,
        coachClass: selectedCls,
        coachCode: coachCode || 'B2',
        seatNumber: seatNumber || 18,
        berthType: berthType || 'LOWER',
      });
    };

    if (!user.authenticated) {
      openAuthModal({
        title: 'Almost there.',
        subtitle: 'Enter your details to continue with your booking.',
        buttonText: 'Continue with Booking',
        contextMessage: `Sign in to reserve your seat on #${train.train_number} ${train.train_name} (${train.from_station.code} ➔ ${train.to_station.code}).`,
        onSuccess: proceedWithBooking,
      });
    } else {
      proceedWithBooking();
    }
  };

  const handleSimulateCancellation = async () => {
    setSimLoading(true);
    setSimMessage(null);
    try {
      const res = await api.simulateSeatEvent({
        train_run_id: simTrainRunId,
        coach_code: simCoachCode,
        seat_number: simSeatNumber,
        event_type: 'CANCELLATION',
      });
      setSimMessage(`✅ ${res.message}. Availability matrix refreshed.`);
      await handleSearch();
      await loadAnalytics();
    } catch (err: any) {
      setSimMessage(`❌ Error: ${err.message}`);
    } finally {
      setSimLoading(false);
    }
  };

  const fromStation = stations.find((s) => s.id === fromStationId);
  const toStation = stations.find((s) => s.id === toStationId);

  return (
    <div className="page-container">
      {/* Hero / Header Card */}
      <div
        className="card mb-4"
        style={{
          background:
            'linear-gradient(135deg, rgba(8, 145, 178, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%)',
          borderColor: 'rgba(8, 145, 178, 0.4)',
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span
              className="badge"
              style={{
                background: 'rgba(6, 182, 212, 0.2)',
                color: '#22d3ee',
                border: '1px solid rgba(6, 182, 212, 0.4)',
                fontWeight: 700,
                fontSize: '0.75rem',
              }}
            >
              SIH26028 INNOVATION MODULE · DYNAMIC SEGMENT TURNOVER
            </span>
          </div>
          <span className="text-xs text-muted">
            ⚠️ SIMULATED INVENTORY DATA · CRIS Architecture Prototype
          </span>
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: 4 }}>
          Last-Minute <span style={{ color: '#38bdf8' }}>Seat & Berth Finder</span>
        </h1>
        <p className="text-secondary" style={{ marginTop: 4, maxWidth: 850 }}>
          Discover confirmed vacant berths and <strong>predicted intermediate deboarding seats</strong> on running trains. 
          Connected in real-time to the <strong>XGBoost Dynamic ETA Engine</strong> to calculate exact boarding opportunity windows.
        </p>

        {/* Quick Segment Presets */}
        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 14 }}>
          <span className="text-xs text-muted mono" style={{ fontWeight: 600, textTransform: 'uppercase' }}>
            Popular Sub-Segments:
          </span>
          {[
            { label: 'New Delhi ➔ Jaipur', fromId: 1, toId: 5 },
            { label: 'Jaipur ➔ Ajmer (+127 Deboard Vacancies)', fromId: 5, toId: 6 },
            { label: 'Ajmer ➔ Ahmedabad', fromId: 6, toId: 9 },
            { label: 'New Delhi ➔ Mumbai Central (Full Corridor)', fromId: 1, toId: 12 },
          ].map((p, idx) => (
            <button
              key={idx}
              className={`btn btn-sm ${
                fromStationId === p.fromId && toStationId === p.toId
                  ? 'btn-primary'
                  : 'btn-secondary'
              }`}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => {
                setFromStationId(p.fromId);
                setToStationId(p.toId);
                handleSearch(p.fromId, p.toId);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Watch Notice Toast */}
      {watchNotice && (
        <div
          className="card mb-4"
          style={{
            background: 'rgba(6, 182, 212, 0.15)',
            borderColor: 'rgba(6, 182, 212, 0.5)',
            color: '#a5f3fc',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '1.2rem' }}>🔔</span>
            <span>{watchNotice}</span>
          </div>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setWatchNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search Filter Controls Bar */}
      <div
        className="card mb-4"
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) 160px',
            gap: 12,
            alignItems: 'end',
          }}
        >
          {/* Origin */}
          <div>
            <label className="text-xs text-muted mono" style={{ display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
              From Station (Boarding)
            </label>
            <select
              value={fromStationId}
              onChange={(e) => setFromStationId(Number(e.target.value))}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              {stations.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.code})
                </option>
              ))}
            </select>
          </div>

          {/* Destination */}
          <div>
            <label className="text-xs text-muted mono" style={{ display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
              To Station (Destination)
            </label>
            <select
              value={toStationId}
              onChange={(e) => setToStationId(Number(e.target.value))}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              {stations.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.code})
                </option>
              ))}
            </select>
          </div>

          {/* Class */}
          <div>
            <label className="text-xs text-muted mono" style={{ display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
              Coach Class
            </label>
            <select
              value={coachClass}
              onChange={(e) => setCoachClass(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="">All Classes (3A, 2A, SL)</option>
              <option value="3A">3 Tier AC (3A)</option>
              <option value="2A">2 Tier AC (2A)</option>
              <option value="SL">Sleeper (SL)</option>
              <option value="1A">First AC (1A)</option>
            </select>
          </div>

          {/* Berth Preference */}
          <div>
            <label className="text-xs text-muted mono" style={{ display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
              Berth Type
            </label>
            <select
              value={berthType}
              onChange={(e) => setBerthType(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="">Any Berth</option>
              <option value="LOWER">Lower Berth (LB)</option>
              <option value="MIDDLE">Middle Berth (MB)</option>
              <option value="UPPER">Upper Berth (UB)</option>
              <option value="SIDE_LOWER">Side Lower (SL)</option>
              <option value="SIDE_UPPER">Side Upper (SU)</option>
            </select>
          </div>

          {/* Search Button */}
          <div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', fontWeight: 700 }}
              onClick={() => handleSearch()}
              disabled={loading}
            >
              {loading ? 'Scanning...' : '🔍 Search Seats'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Results & Side Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        
        {/* Left Column: Search Results */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 style={{ fontSize: '1.15rem' }}>Available Trains on Segment</h2>
              <span className="badge" style={{ background: 'var(--bg-panel-elevated)', color: 'var(--text-secondary)' }}>
                {results.length} Found
              </span>
            </div>
            {fromStation && toStation && (
              <span className="text-xs text-muted mono">
                Segment: <strong style={{ color: '#38bdf8' }}>{fromStation.code}</strong> ➔ <strong style={{ color: '#38bdf8' }}>{toStation.code}</strong>
              </span>
            )}
          </div>

          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div className="mono text-sm" style={{ color: '#38bdf8', marginBottom: 8 }}>
                Scanning Segment Overlap Matrix...
              </div>
              <p className="text-muted text-xs">
                Computing intermediate deboardings at {fromStation?.name} ({fromStation?.code})
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎫</div>
              <h3>No direct trains found on this sub-segment</h3>
              <p className="text-muted text-xs" style={{ marginTop: 4 }}>
                Try another station pair from the preset buttons above.
              </p>
            </div>
          ) : (
            results.map((train) => {
              return (
                <div
                  key={train.train_id}
                  className="card mb-3"
                  style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-strong)',
                    transition: 'border-color 0.2s',
                  }}
                >
                  {/* Train Header Row */}
                  <div className="flex items-center justify-between pb-2 mb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="mono font-bold" style={{ fontSize: '1.2rem', color: '#f1f5f9' }}>
                          #{train.train_number}
                        </span>
                        <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                          {train.train_name}
                        </span>
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(56, 189, 248, 0.15)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            fontSize: '0.68rem',
                          }}
                        >
                          {train.train_type}
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-1">
                        📍 Live: <strong style={{ color: 'var(--text-primary)' }}>{train.current_train_location}</strong> · Distance: <strong style={{ color: '#38bdf8' }}>{train.distance_to_boarding_km} km away</strong>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div className="mono font-bold" style={{ fontSize: '1.5rem', color: '#10b981' }}>
                        {train.total_potential_seats}
                      </div>
                      <div className="text-xs text-muted mono" style={{ textTransform: 'uppercase' }}>
                        Total Berths Available
                      </div>
                    </div>
                  </div>

                  {/* Dynamic ETA Forecasting Integration Box */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 14px',
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <span className="text-xs text-muted mono" style={{ display: 'block', textTransform: 'uppercase' }}>
                        Boarding at {train.from_station.name} ({train.from_station.code})
                      </span>
                      <div className="mono font-bold" style={{ fontSize: '1rem', color: '#f1f5f9', marginTop: 2 }}>
                        {new Date(train.predicted_boarding_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </div>
                      <div className="text-xs text-muted">
                        Sched: {train.scheduled_departure_time} · {train.current_delay_min > 0 ? (
                          <span style={{ color: 'var(--rail-caution)', fontWeight: 700 }}>+{train.current_delay_min}m delay</span>
                        ) : (
                          <span style={{ color: 'var(--rail-ontime)', fontWeight: 700 }}>On Time</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs text-muted mono" style={{ display: 'block', textTransform: 'uppercase' }}>
                        Arrival at {train.to_station.name} ({train.to_station.code})
                      </span>
                      <div className="mono font-bold" style={{ fontSize: '1rem', color: '#f1f5f9', marginTop: 2 }}>
                        {new Date(train.predicted_arrival_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </div>
                      <div className="text-xs text-muted">
                        Sched: {train.scheduled_arrival_time}
                      </div>
                    </div>

                    <div style={{ borderLeft: '1px solid var(--border-default)', paddingLeft: 10 }}>
                      <div className="flex items-center gap-1">
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: train.confidence_level === 'HIGH' ? '#10b981' : '#f59e0b',
                            display: 'inline-block',
                          }}
                        />
                        <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                          {(train.confidence_score * 100).toFixed(0)}% ETA Confidence
                        </span>
                      </div>
                      <p className="text-xs text-muted" style={{ marginTop: 2, fontSize: '0.72rem', lineHeight: 1.2 }}>
                        {train.confidence_reason}
                      </p>
                    </div>
                  </div>

                  {/* Class Breakdown Grid */}
                  <div style={{ marginBottom: 12 }}>
                    <div className="text-xs text-muted mono font-bold uppercase mb-2">
                      Class & Berth Vacancy Breakdown:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${train.classes.length}, 1fr)`, gap: 8 }}>
                      {train.classes.map((cls) => (
                        <div
                          key={cls.coach_class}
                          style={{
                            background: 'var(--bg-panel-elevated)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            padding: '8px 10px',
                          }}
                        >
                          <div className="flex items-center justify-between pb-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <span className="mono font-bold" style={{ color: '#38bdf8' }}>
                              {cls.coach_class}
                            </span>
                            <span className="text-xs mono font-bold">
                              {cls.confirmed_available + cls.predicted_available} Total
                            </span>
                          </div>

                          <div style={{ margin: '6px 0', fontSize: '0.75rem' }}>
                            <div className="flex items-center justify-between" style={{ color: '#10b981' }}>
                              <span>Confirmed Vacant:</span>
                              <strong>{cls.confirmed_available}</strong>
                            </div>
                            <div className="flex items-center justify-between" style={{ color: '#f59e0b' }}>
                              <span>Predicted Deboards:</span>
                              <strong>+{cls.predicted_available}</strong>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-wrap" style={{ paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
                            {Object.entries(cls.berth_breakdown).map(([bType, count]) => (
                              <span
                                key={bType}
                                className="mono"
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '1px 4px',
                                  background: 'var(--bg-canvas)',
                                  borderRadius: 3,
                                  border: '1px solid var(--border-subtle)',
                                }}
                              >
                                {bType.substring(0, 2)}:{count}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border-default)' }}>
                    <div className="flex items-center gap-2">
                      {train.recent_cancellations && train.recent_cancellations.length > 0 && (
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(56, 189, 248, 0.1)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            fontSize: '0.7rem',
                          }}
                        >
                          ⚡ {train.recent_cancellations[0].details}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleSetWatch(train.train_id)}
                      >
                        🔔 Watch Segment
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => {
                          setActiveCoachMap({
                            trainId: train.train_id,
                            trainNumber: train.train_number,
                            trainName: train.train_name,
                            fromStationId: fromStationId,
                            toStationId: toStationId,
                            fromStationCode: train.from_station.code,
                            toStationCode: train.to_station.code,
                            runId: train.run_id,
                          });
                        }}
                      >
                        💺 Coach Map
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ fontWeight: 700 }}
                        onClick={() => handleInitiateBooking(train)}
                      >
                        🎫 Book Ticket
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Operations & Disruption Simulator */}
        <div>
          {/* Disruption Simulator Panel */}
          <div
            className="card mb-4"
            style={{
              background: 'linear-gradient(180deg, var(--bg-panel-elevated) 0%, var(--bg-panel) 100%)',
              border: '1px solid rgba(6, 182, 212, 0.4)',
            }}
          >
            <div className="flex items-center justify-between pb-2 mb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <h3 style={{ fontSize: '1rem', color: '#f1f5f9' }}>
                ⚡ 1-Click Disruption Simulator
              </h3>
              <span
                className="badge"
                style={{
                  background: 'rgba(6, 182, 212, 0.2)',
                  color: '#22d3ee',
                  fontSize: '0.65rem',
                }}
              >
                EVALUATION TOOL
              </span>
            </div>
            <p className="text-muted text-xs mb-3">
              Inject a simulated last-minute cancellation to evaluate real-time vacancy freeing and notifications.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
                  Coach Code:
                </label>
                <input
                  type="text"
                  value={simCoachCode}
                  onChange={(e) => setSimCoachCode(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-md)',
                    padding: '6px 10px',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div>
                <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
                  Seat / Berth #:
                </label>
                <input
                  type="number"
                  value={simSeatNumber}
                  onChange={(e) => setSimSeatNumber(Number(e.target.value))}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-md)',
                    padding: '6px 10px',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                borderColor: '#f59e0b',
                color: '#000',
                fontWeight: 700,
                fontSize: '0.8rem',
                padding: '8px 12px',
              }}
              onClick={handleSimulateCancellation}
              disabled={simLoading}
            >
              {simLoading ? 'Processing...' : '💥 Inject Last-Minute Cancellation'}
            </button>

            {simMessage && (
              <div
                className="mt-2 text-xs mono"
                style={{
                  padding: '8px 10px',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                }}
              >
                {simMessage}
              </div>
            )}
          </div>

          {/* Operations Turnover Metrics */}
          {analytics && (
            <div className="card mb-4" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
              <div className="flex items-center justify-between pb-2 mb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
                <h3 style={{ fontSize: '0.95rem' }}>📊 Segment Turnover Metrics</h3>
                <span className="telemetry-status-pill live" style={{ fontSize: '0.65rem' }}>
                  <span className="live-pulse-dot" /> LIVE SYNC
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ background: 'var(--bg-canvas)', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div className="mono font-bold" style={{ fontSize: '1.25rem', color: '#f1f5f9' }}>
                    {analytics.total_monitored_berths}
                  </div>
                  <div className="text-xs text-muted mono uppercase">Monitored Berths</div>
                </div>

                <div style={{ background: 'var(--bg-canvas)', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div className="mono font-bold" style={{ fontSize: '1.25rem', color: '#10b981' }}>
                    {analytics.total_confirmed_vacant}
                  </div>
                  <div className="text-xs text-muted mono uppercase">Confirmed Vacant</div>
                </div>

                <div style={{ background: 'var(--bg-canvas)', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div className="mono font-bold" style={{ fontSize: '1.25rem', color: '#f59e0b' }}>
                    +{analytics.total_predicted_vacancies}
                  </div>
                  <div className="text-xs text-muted mono uppercase">Predicted Deboards</div>
                </div>

                <div style={{ background: 'var(--bg-canvas)', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div className="mono font-bold" style={{ fontSize: '1.25rem', color: '#38bdf8' }}>
                    {analytics.average_segment_turnover_rate}x
                  </div>
                  <div className="text-xs text-muted mono uppercase">Avg Seat Turnover</div>
                </div>
              </div>

              <div>
                <span className="text-xs text-muted mono uppercase font-bold mb-1" style={{ display: 'block' }}>
                  Top Interchange Deboarding Points:
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {analytics.high_turnover_stations.map((st) => (
                    <div
                      key={st.station_id}
                      className="flex items-center justify-between"
                      style={{
                        padding: '6px 8px',
                        background: 'var(--bg-panel-elevated)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                      }}
                    >
                      <span>{st.station_name} ({st.station_code})</span>
                      <span className="mono font-bold" style={{ color: '#f59e0b' }}>
                        +{st.deboarding_count} deboards
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Active Watches */}
          {watches.length > 0 && (
            <div className="card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
              <div className="flex items-center justify-between pb-2 mb-2" style={{ borderBottom: '1px solid var(--border-default)' }}>
                <h3 style={{ fontSize: '0.95rem' }}>🔔 Active Seat Watches ({watches.length})</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {watches.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between"
                    style={{
                      padding: '8px 10px',
                      background: 'rgba(6, 182, 212, 0.1)',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div>
                      <div className="mono font-bold" style={{ color: '#38bdf8' }}>
                        Train #{w.train_id} · {w.travel_date}
                      </div>
                      <div className="text-muted text-xs">
                        Class: {w.preferred_class || 'Any'} · Berth: {w.preferred_berth || 'Any'}
                      </div>
                    </div>
                    <span className="live-pulse-dot" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Interactive Coach Seat Map Modal */}
      {activeCoachMap && (
        <CoachSeatMap
          trainId={activeCoachMap.trainId}
          trainNumber={activeCoachMap.trainNumber}
          trainName={activeCoachMap.trainName}
          fromStationId={activeCoachMap.fromStationId}
          toStationId={activeCoachMap.toStationId}
          fromStationCode={activeCoachMap.fromStationCode}
          toStationCode={activeCoachMap.toStationCode}
          runId={activeCoachMap.runId}
          onClose={() => setActiveCoachMap(null)}
          onWatchSeat={(coachCode, seatNumber) => {
            handleSetWatch(activeCoachMap.trainId, undefined, undefined);
          }}
          onBookSeat={(coachCode, seatNumber, berthType, coachClass) => {
            const mapInfo = activeCoachMap;
            const proceed = () => {
              setActiveCoachMap(null);
              setBookingData({
                trainNumber: mapInfo.trainNumber,
                trainName: mapInfo.trainName,
                fromStation: mapInfo.fromStationCode,
                toStation: mapInfo.toStationCode,
                travelDate: travelDate,
                coachClass: coachClass,
                coachCode: coachCode,
                seatNumber: seatNumber,
                berthType: berthType,
              });
            };
            if (!user.authenticated) {
              openAuthModal(
                `Sign in to reserve berth #${seatNumber} (${coachCode}) on #${mapInfo.trainNumber} ${mapInfo.trainName}.`,
                proceed
              );
            } else {
              proceed();
            }
          }}
        />
      )}

      {/* Segment Ticket Booking Confirmation Modal */}
      {bookingData && (
        <BookingModal
          trainNumber={bookingData.trainNumber}
          trainName={bookingData.trainName}
          fromStation={bookingData.fromStation}
          toStation={bookingData.toStation}
          travelDate={bookingData.travelDate}
          coachClass={bookingData.coachClass}
          coachCode={bookingData.coachCode}
          seatNumber={bookingData.seatNumber}
          berthType={bookingData.berthType}
          onClose={() => setBookingData(null)}
        />
      )}
    </div>
  );
};
