import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { Station } from '../types';
import { IndoorStationMap } from '../components/IndoorStationMap';
import { DataBadge } from '../components/DataBadge';
import { useAuth } from '../context/AuthContext';

export const StationGuide: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { currentJourney } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number>(1); // NDLS by default
  const [stationSearch, setStationSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStations()
      .then((data) => {
        setStations(data);
        const codeParam = searchParams.get('code');
        if (codeParam) {
          const match = data.find(s => s.code.toUpperCase() === codeParam.toUpperCase());
          if (match) setSelectedStationId(match.id);
          else if (data.length > 0) setSelectedStationId(data[0].id);
        } else if (currentJourney) {
          const match = data.find(s => s.code.toUpperCase() === currentJourney.destCode.toUpperCase());
          if (match) setSelectedStationId(match.id);
          else if (data.length > 0) setSelectedStationId(data[0].id);
        } else if (data.length > 0) {
          setSelectedStationId(data[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [searchParams, currentJourney]);

  const selectedStation = stations.find((s) => s.id === selectedStationId) || stations[0];

  const stationDataMock: Record<string, {
    platforms: number;
    tracks: number;
    zone: string;
    division: string;
    elevation: string;
    wifi: string;
    dailyFootfall: string;
    description: string;
    majorTrains: string[];
  }> = {
    NDLS: {
      platforms: 16,
      tracks: 18,
      zone: 'Northern Railway (NR)',
      division: 'Delhi Division',
      elevation: '214 m (702 ft)',
      wifi: 'RailWire High-Speed Optical Wi-Fi (Active)',
      dailyFootfall: '500,000+ Passengers / Day',
      description: 'New Delhi Railway Station is the main railway junction serving the national capital. It handles over 300 trains daily across North, West, East, and South corridors.',
      majorTrains: ['12952 Mumbai Rajdhani', '12957 Swarna Jayanti Rajdhani', '22436 Vande Bharat Express', '12004 Shatabdi Express'],
    },
    JP: {
      platforms: 7,
      tracks: 9,
      zone: 'North Western Railway (NWR)',
      division: 'Jaipur Division',
      elevation: '430 m (1,410 ft)',
      wifi: 'RailWire Wi-Fi (Active)',
      dailyFootfall: '150,000+ Passengers / Day',
      description: 'Jaipur Junction is the headquarters of North Western Railway, connecting Delhi, Mumbai, Ahmedabad, and major tourist hubs across Rajasthan.',
      majorTrains: ['12957 Swarna Jayanti Rajdhani', '12958 NDLS Rajdhani', '20977 Vande Bharat', '12985 Double Decker'],
    },
    AII: {
      platforms: 5,
      tracks: 7,
      zone: 'North Western Railway (NWR)',
      division: 'Ajmer Division',
      elevation: '464 m (1,522 ft)',
      wifi: 'RailWire Wi-Fi (Active)',
      dailyFootfall: '90,000+ Passengers / Day',
      description: 'Ajmer Junction serves the pilgrimage city of Ajmer Sharif and Pushkar, operating key broad-gauge electrified corridors.',
      majorTrains: ['12957 Swarna Jayanti', '12958 Rajdhani', '20977 Vande Bharat', '19610 Udaipur Express'],
    },
    ADI: {
      platforms: 12,
      tracks: 16,
      zone: 'Western Railway (WR)',
      division: 'Ahmedabad Division',
      elevation: '53 m (174 ft)',
      wifi: 'RailWire Wi-Fi (Active)',
      dailyFootfall: '220,000+ Passengers / Day',
      description: 'Ahmedabad Junction (Kalupur) is the largest railway station in Gujarat, serving the Western trunk corridor and bullet train terminal interchange.',
      majorTrains: ['12952 Mumbai Rajdhani', '12009 Shatabdi Express', '20901 Vande Bharat Express', '12958 Swarna Jayanti'],
    },
    BCT: {
      platforms: 9,
      tracks: 14,
      zone: 'Western Railway (WR)',
      division: 'Mumbai Division',
      elevation: '8 m (26 ft)',
      wifi: 'RailWire Wi-Fi (Active)',
      dailyFootfall: '380,000+ Passengers / Day',
      description: 'Mumbai Central is the southern terminus of the Western Railway corridor, handling premier Rajdhani, August Kranti, and suburban local corridors.',
      majorTrains: ['12952 Mumbai Rajdhani', '12954 August Kranti', '12009 Shatabdi', '12956 Jaipur Superfast'],
    },
  };

  const details = (selectedStation && stationDataMock[selectedStation.code]) || {
    platforms: 6,
    tracks: 8,
    zone: selectedStation?.zone || 'Indian Railways',
    division: 'Operating Division',
    elevation: '200 m',
    wifi: 'RailWire Wi-Fi Available',
    dailyFootfall: '100,000+ Passengers',
    description: `${selectedStation?.name || 'Railway Station'} is an operational broad-gauge station on the electrified corridor.`,
    majorTrains: ['12952 Rajdhani Express', '12957 Swarna Jayanti'],
  };

  return (
    <div className="page-container">
      {/* Header Banner */}
      <div
        className="card mb-4"
        style={{
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(15, 23, 42, 0.9) 100%)',
          borderColor: 'rgba(56, 189, 248, 0.35)',
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <span
            className="badge"
            style={{
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontSize: '0.75rem',
            }}
          >
            🏢 INDIAN RAILWAYS PASSENGER STATION GUIDE
          </span>
          <span className="text-xs text-muted">
            Free Navigation & Directory · No Login Required
          </span>
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: 4 }}>
          Station Guide & <span style={{ color: '#38bdf8' }}>Indoor Wayfinding</span>
        </h1>
        <p className="text-secondary" style={{ marginTop: 4, maxWidth: 850 }}>
          Explore station facilities, Foot Over Bridges, waiting lounges, cloak rooms, IRCTC food plazas, and accessibility assistance.
        </p>

        {currentJourney && (
          <div
            className="card mt-3 mb-2"
            style={{
              background: 'rgba(14, 165, 233, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <div>
                <span className="text-sky-400 font-bold uppercase tracking-wider">Active Trip: </span>
                <span className="text-white">
                  Train #{currentJourney.trainNumber} ({currentJourney.sourceCode} ➔ {currentJourney.destCode})
                </span>
                <span className="text-muted ml-2">
                  Destination: <strong>{currentJourney.destName} ({currentJourney.destCode})</strong>
                </span>
              </div>
              <button
                className="btn btn-xs btn-primary"
                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                onClick={() => {
                  const match = stations.find(s => s.code.toUpperCase() === currentJourney.destCode.toUpperCase());
                  if (match) setSelectedStationId(match.id);
                }}
              >
                View Destination Facilities ({currentJourney.destCode})
              </button>
            </div>
          </div>
        )}

        {/* Station Search & Selector Bar */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.2fr) 1.5fr', gap: 10, alignItems: 'center' }}>
            <div>
              <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
                All 105 Stations (Directory):
              </label>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(Number(e.target.value))}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '7px 10px',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                }}
              >
                {stations.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.code} · {st.name} ({st.zone || 'IR'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
                Search by Name or Code:
              </label>
              <input
                type="text"
                className="input"
                placeholder="Type name (e.g. Kanpur, Varanasi, Mumbai, Howrah, Chennai, Patna)..."
                value={stationSearch}
                onChange={(e) => {
                  const q = e.target.value;
                  setStationSearch(q);
                  if (q.trim()) {
                    const match = stations.find(s =>
                      s.name.toLowerCase().includes(q.toLowerCase()) ||
                      s.code.toLowerCase().includes(q.toLowerCase())
                    );
                    if (match) setSelectedStationId(match.id);
                  }
                }}
                style={{ fontSize: '0.82rem', padding: '7px 10px' }}
              />
            </div>
          </div>

          {/* Quick Hub Chips */}
          <div className="flex items-center gap-2 flex-wrap mt-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <span className="text-xs text-muted mono font-bold uppercase">
              Major Hubs:
            </span>
            {[
              { code: 'NDLS', label: 'New Delhi' },
              { code: 'CNB', label: 'Kanpur' },
              { code: 'MMCT', label: 'Mumbai Central' },
              { code: 'LKO', label: 'Lucknow' },
              { code: 'BSB', label: 'Varanasi' },
              { code: 'HWH', label: 'Howrah' },
              { code: 'JP', label: 'Jaipur' },
              { code: 'MAS', label: 'Chennai' },
              { code: 'SBC', label: 'Bengaluru' },
              { code: 'ADI', label: 'Ahmedabad' },
            ].map((hub) => {
              const st = stations.find(s => s.code === hub.code);
              if (!st) return null;
              return (
                <button
                  key={hub.code}
                  className={`btn btn-sm ${selectedStationId === st.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.74rem', padding: '3px 8px' }}
                  onClick={() => setSelectedStationId(st.id)}
                >
                  <strong className="mono">{hub.code}</strong> {hub.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="text-muted">Loading station directory...</p>
        </div>
      ) : selectedStation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                {selectedStation.name} ({selectedStation.code})
              </h2>
              <DataBadge sourceType="DATABASE" label="INDIAN RAILWAYS DIRECTORY" />
              <DataBadge
                sourceType={stationDataMock[selectedStation.code] ? 'DATABASE' : 'VENDOR_DEMO'}
                label={stationDataMock[selectedStation.code] ? 'SCHEMATIC WAYFINDING' : 'GENERAL DIRECTORY'}
              />
            </div>
            <span className="text-xs text-muted mono">
              Coordinates: {selectedStation.latitude?.toFixed(4)}, {selectedStation.longitude?.toFixed(4)}
            </span>
          </div>
          
          {/* Station Overview Info Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="card" style={{ background: 'var(--bg-panel)', padding: 14 }}>
              <span className="text-xs text-muted mono uppercase">Platforms & Tracks</span>
              <div className="mono font-bold" style={{ fontSize: '1.3rem', color: '#f1f5f9', marginTop: 4 }}>
                {details.platforms} Platforms / {details.tracks} Tracks
              </div>
              <div className="text-xs text-muted mt-1">Full Broad-Gauge Electrified</div>
            </div>

            <div className="card" style={{ background: 'var(--bg-panel)', padding: 14 }}>
              <span className="text-xs text-muted mono uppercase">Zonal Railway</span>
              <div className="mono font-bold" style={{ fontSize: '1.05rem', color: '#38bdf8', marginTop: 4 }}>
                {details.zone}
              </div>
              <div className="text-xs text-muted mt-1">{details.division}</div>
            </div>

            <div className="card" style={{ background: 'var(--bg-panel)', padding: 14 }}>
              <span className="text-xs text-muted mono uppercase">Daily Footfall</span>
              <div className="mono font-bold" style={{ fontSize: '1.2rem', color: '#10b981', marginTop: 4 }}>
                {details.dailyFootfall}
              </div>
              <div className="text-xs text-muted mt-1">High Density Hub</div>
            </div>

            <div className="card" style={{ background: 'var(--bg-panel)', padding: 14 }}>
              <span className="text-xs text-muted mono uppercase">Digital Connectivity</span>
              <div className="mono font-bold" style={{ fontSize: '0.95rem', color: '#f59e0b', marginTop: 4 }}>
                {details.wifi}
              </div>
              <div className="text-xs text-muted mt-1">Station Elevation: {details.elevation}</div>
            </div>
          </div>

          {/* Interactive Indoor Station Map */}
          <IndoorStationMap
            stationCode={selectedStation.code}
            stationName={selectedStation.name}
          />

          {/* Station Overview Text & Major Express Trains */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
            <div className="card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)', padding: 18 }}>
              <h3 style={{ fontSize: '1.05rem', marginBottom: 6 }}>About {selectedStation.name}</h3>
              <p className="text-secondary text-sm" style={{ lineHeight: 1.6 }}>
                {details.description}
              </p>
            </div>

            <div className="card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)', padding: 18 }}>
              <h3 style={{ fontSize: '1.05rem', marginBottom: 8 }}>Major Express Rakes</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {details.majorTrains.map((tr, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between"
                    style={{
                      padding: '6px 10px',
                      background: 'var(--bg-panel-elevated)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.78rem',
                    }}
                  >
                    <span className="mono font-bold" style={{ color: '#f1f5f9' }}>{tr}</span>
                    <span className="badge" style={{ fontSize: '0.65rem', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
                      Daily Run
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
