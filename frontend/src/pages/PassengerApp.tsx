/**
 * PassengerApp — Passenger-focused dynamic ETA tracker.
 * Clean, emoji-free, railway-themed UI with train imagery.
 */
import React, { useState, useEffect, useRef, useCallback, MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { Train, TrainDetail, TrainPredictions, TrainLive, ETAPrediction } from '../types';
import { api, connectRunWS, formatDelay, delayClass, formatTime } from '../api';
import { useAuth } from '../context/AuthContext';
import { BookingModal } from '../components/BookingModal';
import ETACard from '../components/ETACard';
import RouteMap from '../components/RouteMap';
import PassengerTimeline from '../components/PassengerTimeline';

// Map train type → image asset
const TRAIN_IMAGES: Record<string, string> = {
  RAJDHANI: '/assets/train_rajdhani.jpg',
  SHATABDI: '/assets/train_rajdhani.jpg',
  VANDE_BHARAT: '/assets/train_rajdhani.jpg',
  EXPRESS: '/assets/train_express.jpg',
  MAIL: '/assets/train_express.jpg',
  PASSENGER: '/assets/train_express.jpg',
};
const getTrainImage = (type?: string) =>
  TRAIN_IMAGES[type ?? ''] ?? '/assets/train_express.jpg';

export default function PassengerApp() {
  const navigate = useNavigate();
  const { user, saveTrain, openAuthModal, addRecentSearch } = useAuth();

  const [trains, setTrains] = useState<Train[]>([]);
  const [selectedTrainId, setSelectedTrainId] = useState<number | null>(null);

  // Stable ref so loadTrain never re-creates due to auth state changes
  const addRecentSearchRef = useRef(addRecentSearch) as MutableRefObject<typeof addRecentSearch>;
  useEffect(() => { addRecentSearchRef.current = addRecentSearch; }, [addRecentSearch]);

  const [trainDetail, setTrainDetail] = useState<TrainDetail | null>(null);
  const [liveData, setLiveData] = useState<TrainLive | null>(null);
  const [predictions, setPredictions] = useState<TrainPredictions | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [highlightedStation, setHighlightedStation] = useState<number | null>(null);
  const [lastTick, setLastTick] = useState<string>('Just now');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [bookingDetails, setBookingDetails] = useState<{
    trainNumber: string;
    trainName: string;
    fromStation: string;
    toStation: string;
    travelDate: string;
    coachClass: string;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const prevPredsRef = useRef<Record<number, ETAPrediction>>({});

  // Initial load: fetch trains list
  useEffect(() => {
    api.getTrains().then(list => {
      setTrains(list);
      if (list.length > 0) setSelectedTrainId(list[0].id);
    }).catch(() => {});
  }, []);

  const loadTrain = useCallback(async (trainId: number) => {
    setLoading(true);
    try {
      const [detail, live, preds] = await Promise.all([
        api.getTrain(trainId).catch(() => null),
        api.getTrainLive(trainId).catch(() => null),
        api.getTrainPredictions(trainId).catch(() => null),
      ]);

      setTrainDetail(detail);
      setLiveData(live);
      setPredictions(preds);
      setSelectedTrainId(trainId);
      setLastTick('Just now');

      if (detail) {
        addRecentSearchRef.current(`${detail.number} ${detail.name.split(' ')[0]}`);
      }

      if (live?.run?.id) {
        wsRef.current?.close();
        wsRef.current = connectRunWS(live.run.id, (msg) => {
          setPredictions(prev => {
            if (!prev) return prev;
            msg.predictions.forEach(newP => {
              const oldP = prevPredsRef.current[newP.station_id];
              if (oldP && oldP.predicted_eta !== newP.predicted_eta) {
                setHighlightedStation(newP.station_id);
                setTimeout(() => setHighlightedStation(null), 3000);
              }
              prevPredsRef.current[newP.station_id] = newP;
            });
            return { ...prev, predictions: msg.predictions, last_updated: msg.timestamp };
          });

          setLiveData(prev => prev ? {
            ...prev,
            run: { ...prev.run, current_delay_min: msg.current_delay_min },
            active_events: msg.active_events,
          } : prev);

          setLastTick('Just now');
        });
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Stable — addRecentSearch via ref

  useEffect(() => {
    if (selectedTrainId !== null) loadTrain(selectedTrainId);
    return () => wsRef.current?.close();
  }, [selectedTrainId, loadTrain]);

  const handleSaveTrain = () => {
    if (!trainDetail) return;
    if (!user.authenticated) {
      openAuthModal({
        title: 'Save this train',
        subtitle: 'Sign in to save this train across your devices.',
        buttonText: 'Save Train & Continue',
        contextMessage: 'Sign in to save this train and receive live delay alerts.',
        onSuccess: () => {
          saveTrain(trainDetail.id);
          setSaveNotice(`Train #${trainDetail.number} saved to your profile.`);
          setTimeout(() => setSaveNotice(null), 4000);
        },
      });
    } else {
      saveTrain(trainDetail.id);
      setSaveNotice(`Train #${trainDetail.number} saved to your profile.`);
      setTimeout(() => setSaveNotice(null), 4000);
    }
  };

  const handleSetAlert = () => {
    if (!trainDetail) return;
    if (!user.authenticated) {
      openAuthModal({
        title: 'Set Delay Notification Alert',
        subtitle: 'Sign in to receive real-time ETA changes.',
        buttonText: 'Enable Alerts & Continue',
        contextMessage: `Sign in to receive instant alerts if #${trainDetail.number} changes arrival ETA.`,
        onSuccess: () => {
          setSaveNotice(`Delay alert activated for #${trainDetail.number}.`);
          setTimeout(() => setSaveNotice(null), 4000);
        },
      });
    } else {
      setSaveNotice(`Delay alert activated for #${trainDetail.number}.`);
      setTimeout(() => setSaveNotice(null), 4000);
    }
  };

  const handleBookTicketClick = () => {
    if (!trainDetail) return;
    const payload = {
      trainNumber: trainDetail.number,
      trainName: trainDetail.name,
      fromStation: trainDetail.route?.origin_station?.name || 'New Delhi',
      toStation: trainDetail.route?.destination_station?.name || 'Mumbai Central',
      travelDate: new Date().toISOString().split('T')[0],
      coachClass: '3A',
    };
    if (!user.authenticated) {
      openAuthModal({
        title: 'Continue with Booking',
        subtitle: 'Enter your details to confirm the reservation.',
        buttonText: 'Continue with Booking',
        contextMessage: 'Sign in to confirm passenger reservation and receive your E-ticket.',
        onSuccess: () => setBookingDetails(payload),
      });
    } else {
      setBookingDetails(payload);
    }
  };

  const filteredTrains = trains.filter(t =>
    t.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentDelay = liveData?.run?.current_delay_min ?? (predictions?.predictions[0]?.predicted_delay_min ?? 0);
  const nextPred = predictions?.predictions[0];
  const sections = trainDetail?.route?.sections ?? [];
  const stations = sections.map(s => s.to_station);
  const originStation = trainDetail?.route?.origin_station;
  const allStations = originStation ? [originStation, ...stations] : stations;

  return (
    <div className="page-container">

      {/* ── Top Search & Train Selector Bar ── */}
      <div
        className="card mb-4"
        style={{
          background: 'rgba(10, 14, 22, 0.92)',
          borderColor: 'var(--border-strong)',
          padding: '14px 18px',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-muted mono" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {user.authenticated ? `Welcome back, ${user.name}` : 'TrackIQ · Guest Mode · Explore Freely'}
            </div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 2 }}>
              Your journey, <span style={{ color: '#38bdf8' }}>made simpler.</span>
            </h1>
          </div>

          {/* Quick Nav Chips — text only, no emojis */}
          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.75rem' }}
              onClick={() => { const el = document.getElementById('train-search-input'); if (el) el.focus(); }}
            >
              Track Train
            </button>
            <button className="btn btn-sm btn-secondary" style={{ fontSize: '0.75rem' }} onClick={() => navigate('/seat-finder')}>
              Find Seat
            </button>
            <button className="btn btn-sm btn-secondary" style={{ fontSize: '0.75rem' }} onClick={() => navigate('/stations')}>
              Stations
            </button>
            <button className="btn btn-sm btn-secondary" style={{ fontSize: '0.75rem' }} onClick={() => navigate('/pantry')}>
              Pantry
            </button>
          </div>
        </div>

        {/* Search + Train Selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
          <input
            id="train-search-input"
            type="text"
            className="input"
            placeholder="Search train number (12952, 12957), name (Rajdhani), or station (NDLS, ADI)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {filteredTrains.map(t => (
              <button
                key={t.id}
                className={`btn btn-sm ${selectedTrainId === t.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                onClick={() => loadTrain(t.id)}
              >
                #{t.number} {t.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Recent searches */}
        {user.recentSearches.length > 0 && (
          <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
            <span className="text-xs text-muted mono" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Recent:</span>
            {user.recentSearches.map((q, idx) => (
              <span
                key={idx}
                className="badge"
                style={{
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
                onClick={() => setSearchQuery(q)}
              >
                {q}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Save / Alert Notice */}
      {saveNotice && (
        <div
          className="card mb-3"
          style={{
            background: 'rgba(16, 185, 129, 0.12)',
            borderColor: 'rgba(16, 185, 129, 0.35)',
            color: '#a7f3d0',
            padding: '9px 14px',
            fontSize: '0.8rem',
          }}
        >
          {saveNotice}
        </div>
      )}

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="text-muted">Loading live train telemetry & predictions...</p>
        </div>
      )}

      {trainDetail && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>

          {/* ── LEFT COLUMN ── */}
          <div>
            {/* HERO TRAIN CARD with train image */}
            <div
              className="card mb-4"
              style={{
                background: 'rgba(10, 14, 22, 0.94)',
                border: '1px solid var(--border-strong)',
                padding: 0,
                overflow: 'hidden',
              }}
            >
              {/* Train Photo Banner */}
              <div style={{ position: 'relative' }}>
                <img
                  src={getTrainImage(trainDetail.train_type)}
                  alt={trainDetail.name}
                  className="train-hero-img"
                  style={{ height: 150, borderRadius: 0, marginBottom: 0, borderBottom: '1px solid var(--border-subtle)' }}
                />
                {/* Overlay gradient for text legibility */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '55%',
                    background: 'linear-gradient(to top, rgba(10,14,22,0.95) 0%, transparent 100%)',
                  }}
                />
                {/* Train name on image */}
                <div style={{ position: 'absolute', bottom: 10, left: 14, right: 14 }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="mono text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        #{trainDetail.number} · {trainDetail.train_type} · {trainDetail.rake_type}
                      </span>
                      <h2 style={{ fontSize: '1.15rem', marginTop: 1, lineHeight: 1.2 }}>{trainDetail.name}</h2>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span className={`delay-badge ${delayClass(currentDelay)}`} style={{ fontSize: '0.82rem' }}>
                        {formatDelay(currentDelay)}
                      </span>
                      <div className="telemetry-status-pill live mt-2" style={{ display: 'inline-flex', fontSize: '0.65rem' }}>
                        <span className="live-pulse-dot" /> LIVE
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '14px 16px' }}>
                <div className="text-xs text-muted mb-3" style={{ letterSpacing: '0.02em' }}>
                  {trainDetail.route?.origin_station?.name} → {trainDetail.route?.destination_station?.name}
                </div>

                {/* Next Station Block */}
                {nextPred && (
                  <div
                    style={{
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      marginBottom: 12,
                    }}
                  >
                    <div className="text-xs text-muted mb-1 mono" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Next Arrival
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                          {nextPred.station.name}
                          <span className="mono text-muted" style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: 6 }}>
                            ({nextPred.station.code})
                          </span>
                        </div>
                        <div className="text-xs text-muted mt-1">
                          Scheduled: <span className="mono">{formatTime(nextPred.scheduled_eta)}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="mono font-bold" style={{ fontSize: '1.3rem', color: '#10b981' }}>
                          {formatTime(nextPred.predicted_eta)}
                        </div>
                        <div className="text-xs" style={{ color: nextPred.predicted_delay_min > 0 ? 'var(--rail-caution)' : 'var(--rail-ontime)' }}>
                          {formatDelay(nextPred.predicted_delay_min)}
                        </div>
                      </div>
                    </div>

                    {nextPred.lower_bound_eta && nextPred.upper_bound_eta && (
                      <div
                        className="text-xs text-muted mono flex items-center justify-between mt-2 pt-2"
                        style={{ borderTop: '1px solid var(--border-subtle)' }}
                      >
                        <span>Confidence Interval:</span>
                        <span>{formatTime(nextPred.lower_bound_eta)} – {formatTime(nextPred.upper_bound_eta)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Action Toolbar */}
                <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <div className="flex items-center gap-2">
                    <button className="btn btn-sm btn-secondary" style={{ fontSize: '0.73rem' }} onClick={handleSaveTrain}>
                      Save Train
                    </button>
                    <button className="btn btn-sm btn-secondary" style={{ fontSize: '0.73rem' }} onClick={handleSetAlert}>
                      Delay Alert
                    </button>
                    <button className="btn btn-sm btn-secondary" style={{ fontSize: '0.73rem' }} onClick={() => navigate('/pantry')}>
                      Order Food
                    </button>
                  </div>
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ fontSize: '0.75rem', fontWeight: 700 }}
                    onClick={handleBookTicketClick}
                  >
                    Book Ticket
                  </button>
                </div>
              </div>
            </div>

            {/* ETA Prediction Cards */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 style={{ fontSize: '1rem' }}>Dynamic ETA · Upcoming Stations</h3>
                <span className="text-xs text-muted mono">Updated {lastTick}</span>
              </div>
              {predictions?.predictions.map((pred, i) => (
                <ETACard
                  key={pred.id}
                  prediction={pred}
                  stopNumber={i + 1}
                  highlight={highlightedStation === pred.station_id}
                />
              ))}
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div>
            <div className="card mb-4">
              <div className="card-header">
                <h3>Live Route Map</h3>
                <span className="text-xs text-muted mono">
                  {liveData?.latest_telemetry?.speed_kmh?.toFixed(0) ?? 0} km/h
                </span>
              </div>
              <RouteMap
                stations={allStations}
                sections={trainDetail.route?.sections}
                activeEvents={liveData?.active_events}
                trainLat={liveData?.latest_telemetry?.latitude}
                trainLon={liveData?.latest_telemetry?.longitude}
                trainNumber={trainDetail.number}
                delayMin={liveData?.run?.current_delay_min ?? 0}
                speedKmh={liveData?.latest_telemetry?.speed_kmh ?? 0}
                onSelectStation={(st) => setHighlightedStation(st.id)}
              />
            </div>

            <div className="card">
              <div className="card-header">
                <h3>Journey Timeline</h3>
                <span className="text-xs text-muted">{allStations.length} Halts</span>
              </div>
              <PassengerTimeline
                stops={trainDetail.scheduled_stops || []}
                predictions={predictions?.predictions ?? []}
                currentStationId={liveData?.latest_telemetry?.current_station_id}
                currentDelayMin={liveData?.run?.current_delay_min ?? 0}
                currentSpeedKmh={liveData?.latest_telemetry?.speed_kmh ?? 0}
              />
            </div>
          </div>
        </div>
      )}

      {bookingDetails && (
        <BookingModal
          trainNumber={bookingDetails.trainNumber}
          trainName={bookingDetails.trainName}
          fromStation={bookingDetails.fromStation}
          toStation={bookingDetails.toStation}
          travelDate={bookingDetails.travelDate}
          coachClass={bookingDetails.coachClass}
          onClose={() => setBookingDetails(null)}
        />
      )}
    </div>
  );
}
