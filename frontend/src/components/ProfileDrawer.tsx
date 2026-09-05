import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrain?: (trainId: number) => void;
}

export const ProfileDrawer: React.FC<ProfileDrawerProps> = ({ isOpen, onClose, onSelectTrain }) => {
  const { user, logout, openAuthModal, removeSavedTrain } = useAuth();
  const [activeTab, setActiveTab] = useState<'BOOKINGS' | 'PANTRY' | 'SAVED' | 'SETTINGS'>('BOOKINGS');

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        className="animate-fadeIn"
        style={{
          width: '100%',
          maxWidth: 440,
          height: '100%',
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-10px 0 30px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-2">
            <div className="navbar-logo-badge" style={{ width: 34, height: 34, fontSize: '0.8rem', background: '#0284c7', color: '#ffffff', fontWeight: 800 }}>
              TQ
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', color: '#f1f5f9' }}>
                {user.authenticated ? user.name : 'Guest Passenger'}
              </h2>
              <span className="text-xs text-muted mono">
                {user.authenticated ? `${user.email} · +91 ${user.mobile}` : "TrackIQ Guest Mode · Unrestricted Explorer"}
              </span>
            </div>
          </div>

          <button
            className="btn btn-sm btn-secondary"
            onClick={onClose}
            style={{ fontSize: '1.1rem', padding: '2px 8px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Guest Banner if not signed in */}
        {!user.authenticated && (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              marginBottom: 16,
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <strong style={{ color: '#38bdf8', fontSize: '0.85rem' }}>You're browsing as a guest.</strong>
                <p className="text-muted text-xs" style={{ marginTop: 2 }}>
                  Sign in to view personalized booking history and sync saved journeys across devices.
                </p>
              </div>
              <button
                className="btn btn-sm btn-primary"
                style={{ fontSize: '0.75rem', padding: '6px 12px', fontWeight: 700 }}
                onClick={() => {
                  onClose();
                  openAuthModal({
                    title: 'Sign in to TrackIQ',
                    subtitle: 'Access your saved trains, E-tickets, and preferences.',
                    buttonText: 'Sign In & Continue',
                    contextMessage: 'Sign in to access your synchronized booking records and custom railway alert preferences.',
                  });
                }}
              >
                Sign In
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-3" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
          {[
            { key: 'BOOKINGS', label: `🎫 Bookings (${user.bookings.length})` },
            { key: 'PANTRY', label: `🍱 Pantry (${user.pantryOrders.length})` },
            { key: 'SAVED', label: `⭐ Saved (${user.savedTrains.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.72rem', padding: '4px 8px', flex: 1 }}
              onClick={() => setActiveTab(tab.key as any)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'BOOKINGS' && (
            <div>
              {user.bookings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-disabled)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 6 }}>🎫</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>No Bookings Yet</div>
                  <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                    Reserve seats via the Last-Minute Seat Finder to view confirmed E-tickets here.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {user.bookings.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        padding: 12,
                      }}
                    >
                      <div className="flex items-center justify-between pb-1 mb-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <span className="mono font-bold" style={{ color: '#38bdf8' }}>{b.pnr}</span>
                        <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.65rem' }}>
                          {b.status}
                        </span>
                      </div>
                      <div className="text-xs text-secondary space-y-1">
                        <div><strong>#{b.trainNumber}</strong> · {b.trainName}</div>
                        <div>Segment: {b.fromStation} ➔ {b.toStation}</div>
                        <div>Date: {b.date} · <strong className="text-emerald-400">Coach {b.coachCode}, Seat #{b.seatNumber} ({b.berthType})</strong></div>
                        <div className="mono pt-1 text-muted">Paid: ₹{b.amountPaid}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'PANTRY' && (
            <div>
              {user.pantryOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-disabled)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 6 }}>🍱</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>No Pantry Orders</div>
                  <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                    Order meals from the Pantry Services tab to enjoy fresh berth delivery.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {user.pantryOrders.map((o) => (
                    <div
                      key={o.id}
                      style={{
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        padding: 12,
                      }}
                    >
                      <div className="flex items-center justify-between pb-1 mb-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <span className="mono font-bold" style={{ color: '#f59e0b' }}>{o.orderNumber}</span>
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontSize: '0.65rem' }}>
                          {o.status}
                        </span>
                      </div>
                      <div className="text-xs text-secondary space-y-1">
                        <div><strong>{o.trainName}</strong></div>
                        <div>Delivering at: {o.deliveryStation}</div>
                        <div>Berth: Coach {o.coachCode}, Seat #{o.seatNumber}</div>
                        <div>Items: {o.items.map(i => `${i.name} (×${i.quantity})`).join(', ')}</div>
                        <div className="mono pt-1 font-bold text-emerald-400">Total: ₹{o.totalAmount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'SAVED' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { id: 1, number: '12952', name: 'Mumbai Rajdhani Express', route: 'New Delhi ➔ Mumbai Central' },
                  { id: 2, number: '12957', name: 'Swarna Jayanti Rajdhani', route: 'Ahmedabad ➔ New Delhi' },
                ].map((tr) => (
                  <div
                    key={tr.id}
                    className="flex items-center justify-between"
                    style={{
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 12px',
                    }}
                  >
                    <div>
                      <strong className="mono font-bold" style={{ color: '#38bdf8' }}>#{tr.number}</strong>
                      <div className="text-xs text-white">{tr.name}</div>
                      <div className="text-xs text-muted">{tr.route}</div>
                    </div>

                    <button
                      className="btn btn-sm btn-primary"
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      onClick={() => {
                        if (onSelectTrain) onSelectTrain(tr.id);
                        onClose();
                      }}
                    >
                      Track Now
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-3 mt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
          {user.authenticated ? (
            <button
              className="btn btn-sm btn-secondary"
              style={{ width: '100%', padding: '8px 12px', color: 'var(--rail-critical)' }}
              onClick={logout}
            >
              Sign Out (Return to Guest Mode)
            </button>
          ) : (
            <button
              className="btn btn-sm btn-primary"
              style={{ width: '100%', padding: '8px 12px' }}
              onClick={() => openAuthModal('Sign in to manage your bookings and preferences.')}
            >
              Sign In to Account
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
