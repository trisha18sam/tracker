import React, { useState } from 'react';
import { useAuth, BookingRecord } from '../context/AuthContext';

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
  onClose,
}) => {
  const { user, addBooking } = useAuth();
  const [passengerName, setPassengerName] = useState(user.name || 'Rahul Sharma');
  const [age, setAge] = useState('32');
  const [gender, setGender] = useState('MALE');
  const [confirmedBooking, setConfirmedBooking] = useState<BookingRecord | null>(null);

  const fareTable: Record<string, number> = {
    '1A': 2850,
    '2A': 1650,
    '3A': 1140,
    'SL': 430,
    'CC': 620,
  };
  const fare = fareTable[coachClass] || 1140;

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
      berthType,
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
          maxWidth: 480,
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
                  Confirm Segment Ticket
                </h2>
                <span className="text-xs text-muted mono">
                  CRIS Prototype PRS Terminal
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
                <div className="flex items-center justify-between">
                  <span>Allocated Berth:</span>
                  <strong className="text-emerald-400">Coach {coachCode} · Berth #{seatNumber} ({berthType})</strong>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
            </div>

            {/* Fare Summary & CTA */}
            <div className="flex items-center justify-between font-bold text-sm mb-4 pt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
              <span>Total Segment Fare:</span>
              <span className="mono" style={{ fontSize: '1.3rem', color: '#10b981' }}>
                ₹{fare}
              </span>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px 14px', fontSize: '0.9rem', fontWeight: 700 }}
              onClick={handleConfirm}
            >
              ⚡ Confirm & Issue E-Ticket
            </button>
          </div>
        ) : (
          /* Confirmed E-Ticket Receipt */
          <div>
            <div className="text-center pb-3 mb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 4 }}>🎉</div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981' }}>
                E-Ticket Confirmed!
              </h2>
              <div className="mono font-bold mt-1" style={{ fontSize: '1.1rem', color: '#38bdf8' }}>
                {confirmedBooking.pnr}
              </div>
              <p className="text-muted text-xs">
                Generated via CRIS Dynamic Reservation Prototype
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
                <span className="text-muted">Class & Berth:</span>
                <strong className="text-emerald-400">
                  Coach {confirmedBooking.coachCode} · Berth #{confirmedBooking.seatNumber} ({confirmedBooking.berthType})
                </strong>
              </div>
              <div className="flex items-center justify-between pt-2 mt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <span className="text-muted">Fare Paid:</span>
                <span className="mono font-bold" style={{ color: '#10b981' }}>₹{confirmedBooking.amountPaid}</span>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '9px 12px', fontWeight: 700 }}
              onClick={onClose}
            >
              Done & View in Profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
