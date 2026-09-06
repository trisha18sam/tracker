import React, { useState } from 'react';
import { useAuth, BookingRecord } from '../context/AuthContext';
import { calculateFare } from '../utils/fareCalculator';

interface BookingModalProps {
  trainNumber: string;
  trainName: string;
  fromStation: string;
  toStation: string;
  travelDate: string;
  coachClass: string;
  coachCode?: string;
  seatNumber?: number;
  berthType?: string;
  fare?: number;
  fareSource?: string;
  distanceKm?: number;
  onClose: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  trainNumber,
  trainName,
  fromStation,
  toStation,
  travelDate,
  coachClass,
  coachCode = 'B2',
  seatNumber = 18,
  berthType = 'LOWER',
  fare: propFare,
  fareSource = 'IR Telescopic Tariff',
  distanceKm,
  onClose,
}) => {
  const { user, addBooking } = useAuth();
  const [passengerName, setPassengerName] = useState(user.name || 'Rahul Sharma');
  const [age, setAge] = useState('32');
  const [gender, setGender] = useState('MALE');
  const [preferredBerth, setPreferredBerth] = useState<string>(berthType || 'LOWER');
  const [confirmedBooking, setConfirmedBooking] = useState<BookingRecord | null>(null);

  // Use passed fare or dynamic IR telescopic calculation
  const computedFareObj = calculateFare(distanceKm || 550, coachClass);
  const fare = propFare || computedFareObj.fare;

  const handleConfirm = () => {
    const booking = addBooking({
      trainNumber,
      trainName,
      fromStation,
      toStation,
      date: travelDate,
      coachClass,
      coachCode,
      seatNumber,
      berthType: preferredBerth,
      amountPaid: fare,
    });
    setConfirmedBooking(booking);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.85)',
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
          maxWidth: 500,
          background: 'var(--bg-panel)',
          borderColor: confirmedBooking ? '#10b981' : 'rgba(56, 189, 248, 0.4)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)',
          padding: 24,
        }}
      >
        {!confirmedBooking ? (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f1f5f9' }}>
                  Prototype Segment Booking
                </h2>
                <span className="text-xs text-muted mono">
                  SIH Prototype PRS Simulator · Transparent Allocation
                </span>
              </div>
              <button
                className="btn btn-sm btn-secondary"
                onClick={onClose}
                style={{ fontSize: '1.1rem', padding: '2px 8px', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Journey Summary Card */}
            <div
              style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                marginBottom: 14,
              }}
            >
              <div className="flex items-center justify-between pb-2 mb-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <strong className="mono font-bold" style={{ color: '#38bdf8' }}>#{trainNumber}</strong> · {trainName}
                </div>
                <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
                  {coachClass} Class
                </span>
              </div>

              <div className="text-xs text-secondary space-y-1">
                <div className="flex items-center justify-between">
                  <span>Segment:</span>
                  <strong className="text-white">{fromStation} ➔ {toStation}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Travel Date:</span>
                  <strong className="text-white">{travelDate}</strong>
                </div>
              </div>
            </div>

            {/* Passenger Details */}
            <div style={{ marginBottom: 14 }}>
              <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
                Passenger Name:
              </label>
              <input
                type="text"
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                  marginBottom: 8,
                }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
                    Age:
                  </label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 12px',
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem',
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
                    Gender:
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 12px',
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem',
                    }}
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Transgender</option>
                  </select>
                </div>
              </div>

              {/* Berth Preference (Subject to availability) */}
              <div style={{ marginBottom: 10 }}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted mono uppercase">
                    Berth Preference:
                  </label>
                  <span className="text-xs" style={{ color: '#f59e0b', fontSize: '0.75rem' }}>
                    Not Guaranteed
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                  {[
                    { id: 'LOWER', label: 'Lower' },
                    { id: 'MIDDLE', label: 'Middle' },
                    { id: 'UPPER', label: 'Upper' },
                    { id: 'SIDE_LOWER', label: 'Side L' },
                    { id: 'SIDE_UPPER', label: 'Side U' },
                  ].map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setPreferredBerth(b.id)}
                      className={`btn btn-xs ${preferredBerth === b.id ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.75rem', padding: '6px 2px', textAlign: 'center' }}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted mt-1.5" style={{ fontSize: '0.74rem', lineHeight: 1.3 }}>
                  ℹ️ <em>Berth preference will be considered during PRS allocation subject to availability, but cannot be guaranteed.</em>
                </p>
              </div>
            </div>

            {/* Prototype Disclaimer Banner */}
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 10px',
                marginBottom: 14,
                fontSize: '0.75rem',
                color: '#fbbf24',
              }}
            >
              <strong>Prototype Demonstration:</strong> This booking simulates segment vacancy allocation. In production, this handoffs to authorized IRCTC/CRIS PRS for actual ticketing.
            </div>

            {/* Fare Summary & CTA */}
            <div className="flex items-center justify-between font-bold text-sm mb-1 pt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
              <span>Indicative Fare:</span>
              <span className="mono" style={{ fontSize: '1.25rem', color: '#10b981' }}>
                ₹{fare}
              </span>
            </div>
            <div className="text-right text-xs text-muted mb-4 mono" style={{ fontSize: '0.72rem' }}>
              {fareSource}
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px 14px', fontSize: '0.9rem', fontWeight: 700 }}
              onClick={handleConfirm}
            >
              Proceed with Prototype Booking
            </button>
          </div>
        ) : (
          /* Prototype Booking Receipt */
          <div>
            <div className="text-center pb-3 mb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 4 }}>📋</div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8' }}>
                Prototype Reservation Logged
              </h2>
              <div className="mono font-bold mt-1 text-xs px-2 py-1 rounded inline-block" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                Reference ID: {confirmedBooking.pnr} (SIMULATED)
              </div>
              <p className="text-muted text-xs mt-1">
                Simulated PRS segment allocation demonstration
              </p>
            </div>

            <div style={{ background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 14, fontSize: '0.8rem' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted">Train:</span>
                <strong className="text-white">#{confirmedBooking.trainNumber} · {confirmedBooking.trainName}</strong>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted">Segment:</span>
                <strong className="text-white">{confirmedBooking.fromStation} ➔ {confirmedBooking.toStation}</strong>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted">Requested Berth:</span>
                <strong className="text-amber-400">
                  {confirmedBooking.berthType} (Preference Recorded)
                </strong>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted">Allotted Coach/Seat:</span>
                <span className="text-muted italic">
                  Chart Not Prepared · Subject to Final PRS Allocation
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 mt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <span className="text-muted">Indicative Fare:</span>
                <span className="mono font-bold" style={{ color: '#10b981' }}>₹{confirmedBooking.amountPaid}</span>
              </div>
            </div>

            <p className="text-xs text-muted mb-3" style={{ fontSize: '0.74rem' }}>
              <em>Note: As this is a research prototype for SIH, real tickets must be booked via IRCTC or authorized PRS counters.</em>
            </p>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '9px 12px', fontWeight: 700 }}
              onClick={onClose}
            >
              Done & Return to App
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
