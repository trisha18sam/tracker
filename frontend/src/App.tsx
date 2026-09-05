import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import PassengerApp from './pages/PassengerApp';
import Dashboard from './pages/Dashboard';
import PredictionAnalytics from './pages/PredictionAnalytics';
import DemoMode from './pages/DemoMode';
import { SeatFinder } from './pages/SeatFinder';
import { StationGuide } from './pages/StationGuide';
import { PantryServices } from './pages/PantryServices';
import { AuthModal } from './components/AuthModal';
import { ProfileDrawer } from './components/ProfileDrawer';
import './index.css';

function AppContent() {
  const { user, openAuthModal } = useAuth();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Kolkata',
        }) + ' IST'
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="layout">
      {/* TrackIQ / Indian Railways Industrial Navigation Header */}
      <nav className="navbar">
        <NavLink to="/" className="navbar-brand">
          <div className="navbar-logo-badge" style={{ background: '#0284c7', color: '#ffffff', fontWeight: 800 }}>
            TQ
          </div>
          <div className="navbar-title-wrap">
            <div className="navbar-system-title">
              TrackIQ <span style={{ fontWeight: 500, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>· Dynamic Train ETA</span>
              <span className="sih-tag">SIH26028</span>
            </div>
            <div className="navbar-system-subtitle">
              Centre for Railway Information Systems (CRIS) Prototype Architecture
            </div>
          </div>
        </NavLink>

        {/* Distinct Experience Navigation Links */}
        <div className="navbar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Passenger View
          </NavLink>
          <NavLink
            to="/seat-finder"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Seat Finder
          </NavLink>
          <NavLink
            to="/pantry"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Pantry
          </NavLink>
          <NavLink
            to="/stations"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Station Guide
          </NavLink>
          <NavLink
            to="/operations"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Operations
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Analytics
          </NavLink>
          <NavLink
            to="/demo"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            SIH Demo
          </NavLink>
        </div>

        {/* Right Header Status & User Profile Bar */}
        <div className="navbar-right">
          {/* User / Guest Pill */}
          {user.authenticated ? (
            <button
              className="btn btn-sm btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderColor: 'rgba(16, 185, 129, 0.4)',
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#34d399',
              }}
              onClick={() => setProfileOpen(true)}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
              <strong>{user.name}</strong>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                className="btn btn-sm btn-secondary"
                style={{
                  fontSize: '0.72rem',
                  padding: '4px 8px',
                  color: 'var(--text-secondary)',
                }}
                onClick={() => setProfileOpen(true)}
              >
                Guest Mode
              </button>
              <button
                className="btn btn-sm btn-primary"
                style={{
                  fontSize: '0.72rem',
                  padding: '4px 8px',
                  fontWeight: 700,
                }}
                onClick={() =>
                  openAuthModal({
                    title: 'Sign in to TrackIQ',
                    subtitle: 'Access saved trains, bookings, and alerts.',
                    buttonText: 'Sign In & Continue',
                    contextMessage: 'Sign in to access your synchronized booking records and customized arrival notifications.',
                  })
                }
              >
                Sign In
              </button>
            </div>
          )}

          <div className="rail-clock">
            {currentTime || '00:00:00 IST'}
          </div>
          <div className="telemetry-status-pill live">
            <span className="live-pulse-dot" />
            LIVE (60x)
          </div>
        </div>
      </nav>

      {/* View Routing */}
      <main>
        <Routes>
          <Route path="/" element={<PassengerApp />} />
          <Route path="/seat-finder" element={<SeatFinder />} />
          <Route path="/find-seat" element={<Navigate to="/seat-finder" replace />} />
          <Route path="/pantry" element={<PantryServices />} />
          <Route path="/stations" element={<StationGuide />} />
          <Route path="/station-guide" element={<Navigate to="/stations" replace />} />
          <Route path="/operations" element={<Dashboard />} />
          <Route path="/dashboard" element={<Navigate to="/operations" replace />} />
          <Route path="/analytics" element={<PredictionAnalytics />} />
          <Route path="/demo" element={<DemoMode />} />
        </Routes>
      </main>

      {/* Context-Aware Global Auth Modal & Profile Drawer */}
      <AuthModal />
      <ProfileDrawer
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
