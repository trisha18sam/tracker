import React, { useState } from 'react';

interface IndoorStationMapProps {
  stationCode: string;
  stationName: string;
}

interface AmenityPoint {
  id: string;
  name: string;
  category: 'FOOD' | 'WAITING' | 'ACCESSIBILITY' | 'EXIT' | 'TICKETING' | 'MEDICAL';
  platform: string;
  locationLabel: string;
  icon: string;
}

export const IndoorStationMap: React.FC<IndoorStationMapProps> = ({ stationCode, stationName }) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [selectedAmenity, setSelectedAmenity] = useState<AmenityPoint | null>(null);

  const amenities: AmenityPoint[] = [
    { id: '1', name: 'Executive Waiting Lounge (AC)', category: 'WAITING', platform: 'PF 1', locationLabel: 'Main Concourse North', icon: '🛋️' },
    { id: '2', name: 'IRCTC Food Plaza & Jan Aahaar', category: 'FOOD', platform: 'PF 1', locationLabel: 'Near Gate 2 Exit', icon: '🍱' },
    { id: '3', name: 'Battery Operated Car Pickup Point', category: 'ACCESSIBILITY', platform: 'PF 1 & PF 16', locationLabel: 'Pahar Ganj & Ajmeri Gate Sides', icon: '🛺' },
    { id: '4', name: 'Wheelchair Assistance & Ramp', category: 'ACCESSIBILITY', platform: 'PF 1', locationLabel: 'Chief Booking Supervisor Office', icon: '♿' },
    { id: '5', name: 'Central Foot Over Bridge (FOB 2) Escalator', category: 'ACCESSIBILITY', platform: 'PF 2/3, 4/5, 6/7', locationLabel: 'Connecting All Platforms', icon: '🪜' },
    { id: '6', name: '24/7 Railway Medical Emergency Booth', category: 'MEDICAL', platform: 'PF 1', locationLabel: 'Adjacent to Station Director Office', icon: '🏥' },
    { id: '7', name: '24/7 Cloak Room & Luggage Locker', category: 'WAITING', platform: 'PF 16', locationLabel: 'Ajmeri Gate Concourse', icon: '🧳' },
    { id: '8', name: 'Unreserved & PRS Ticket Counters', category: 'TICKETING', platform: 'Entry Hall', locationLabel: 'Main Concourse East', icon: '🎫' },
    { id: '9', name: 'Metro Airport Line Interchange Direct FOB', category: 'EXIT', platform: 'PF 16 FOB', locationLabel: 'Ajmeri Gate Skywalk', icon: '🚇' },
  ];

  const filteredAmenities = selectedFilter === 'ALL'
    ? amenities
    : amenities.filter(a => a.category === selectedFilter);

  return (
    <div className="card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)', padding: 20 }}>
      <div className="flex items-center justify-between pb-3 mb-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <div>
          <div className="flex items-center gap-2">
            <h3 style={{ fontSize: '1.15rem', color: '#f1f5f9' }}>
              📍 Indoor Station Map & Wayfinding
            </h3>
            <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              {stationCode} · {stationName}
            </span>
          </div>
          <p className="text-xs text-muted" style={{ marginTop: 2 }}>
            Interactive schematic of platform concourses, Foot Over Bridges (FOB), escalators, and amenities.
          </p>
        </div>

        <div className="telemetry-status-pill live" style={{ fontSize: '0.68rem' }}>
          <span className="live-pulse-dot" /> ACCESSIBILITY VERIFIED
        </div>
      </div>

      {/* Filter Category Chips */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {[
          { key: 'ALL', label: 'All Amenities' },
          { key: 'ACCESSIBILITY', label: '♿ Escalators & Wheelchairs' },
          { key: 'WAITING', label: '🛋️ Waiting Lounges & Cloak Rooms' },
          { key: 'FOOD', label: '🍱 Food Plaza & Water' },
          { key: 'MEDICAL', label: '🏥 Medical Booth' },
          { key: 'EXIT', label: '🚇 Metro & Exits' },
        ].map(cat => (
          <button
            key={cat.key}
            className={`btn btn-sm ${selectedFilter === cat.key ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.72rem', padding: '4px 10px' }}
            onClick={() => setSelectedFilter(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 16 }}>
        {/* Visual 2D Station Schematic Map */}
        <div
          style={{
            background: 'var(--bg-canvas)',
            border: '2px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: 18,
            position: 'relative',
          }}
        >
          {/* North / Ajmeri Gate Concourse */}
          <div
            style={{
              background: 'var(--bg-panel-elevated)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              textAlign: 'center',
              marginBottom: 12,
              fontSize: '0.75rem',
              color: '#38bdf8',
              fontWeight: 700,
            }}
          >
            ▲ ENTRY 2: AJMERI GATE CONCOURSE & METRO SKYWALK (PF 16 SIDE)
          </div>

          {/* Platforms Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { pf: 'Platform 16 / 15', track: 'Express & Vande Bharat Rakes', badge: 'PF 16' },
              { pf: 'Platform 14 / 13', track: 'Main Line Long Distance', badge: 'PF 14' },
              { pf: 'Platform 10 / 9', track: 'Rajdhani & Premium Express', badge: 'PF 9' },
              { pf: 'Platform 6 / 5', track: 'Superfast & Mail Corridors', badge: 'PF 5' },
              { pf: 'Platform 2 / 3', track: 'Intercity & Passenger Rakes', badge: 'PF 2' },
              { pf: 'Platform 1 (Main VIP)', track: 'Executive Departure Concourse', badge: 'PF 1' },
            ].map((p, idx) => (
              <div
                key={idx}
                style={{
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.78rem',
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="mono font-bold" style={{ color: '#f1f5f9' }}>{p.pf}</span>
                  <span className="text-muted text-xs">({p.track})</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: '0.7rem', padding: '1px 5px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', borderRadius: 3, border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                    FOB-2 Connected
                  </span>
                  <span style={{ fontSize: '0.7rem', padding: '1px 5px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: 3, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    Escalator 🪜
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* South / Paharganj Main Concourse */}
          <div
            style={{
              background: 'var(--bg-panel-elevated)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              textAlign: 'center',
              marginTop: 12,
              fontSize: '0.75rem',
              color: '#10b981',
              fontWeight: 700,
            }}
          >
            ▼ ENTRY 1: PAHARGANJ MAIN CONCOURSE & VIP ENTRY (PF 1 SIDE)
          </div>
        </div>

        {/* Amenity Details & Wayfinding Directory */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="text-xs text-muted mono uppercase font-bold mb-1">
            Station Amenities ({filteredAmenities.length}):
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
            {filteredAmenities.map((item) => (
              <div
                key={item.id}
                style={{
                  background: selectedAmenity?.id === item.id ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-panel-elevated)',
                  border: `1px solid ${selectedAmenity?.id === item.id ? '#38bdf8' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onClick={() => setSelectedAmenity(item)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span>{item.icon}</span>
                    <strong style={{ fontSize: '0.8rem', color: '#f1f5f9' }}>{item.name}</strong>
                  </div>
                  <span className="mono text-xs" style={{ color: '#38bdf8', fontWeight: 700 }}>
                    {item.platform}
                  </span>
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                  📍 {item.locationLabel}
                </div>
              </div>
            ))}
          </div>

          {selectedAmenity && (
            <div
              className="animate-fadeIn"
              style={{
                background: 'rgba(6, 182, 212, 0.12)',
                border: '1px solid rgba(6, 182, 212, 0.35)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                marginTop: 4,
                fontSize: '0.75rem',
              }}
            >
              <div className="flex items-center justify-between font-bold" style={{ color: '#22d3ee' }}>
                <span>Navigation Directions:</span>
                <span>{selectedAmenity.platform}</span>
              </div>
              <p className="text-secondary" style={{ marginTop: 2 }}>
                Take Central FOB-2 from your platform, walk toward {selectedAmenity.locationLabel}. Follow the blue signboards for <strong>{selectedAmenity.name}</strong>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
