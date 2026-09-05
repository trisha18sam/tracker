import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const AuthModal: React.FC = () => {
  const {
    authModalOpen,
    authTitle,
    authSubtitle,
    authButtonText,
    authContextMessage,
    closeAuthModal,
    login,
  } = useAuth();

  const [isSignInMode, setIsSignInMode] = useState(false);
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!authModalOpen) return null;

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const validateMobile = (val: string) => {
    return /^[6-9]\d{9}$/.test(val.trim());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!validateEmail(email)) {
      setError('Please enter a valid email address (e.g. passenger@domain.com).');
      return;
    }

    if (!mobile.trim()) {
      setError('Please enter your 10-digit mobile number.');
      return;
    }
    if (!validateMobile(mobile)) {
      setError('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      login(email, mobile, name || undefined);
      setLoading(false);
    }, 400);
  };

  const handleGoogleDemoAuth = () => {
    setLoading(true);
    setTimeout(() => {
      login('passenger.google@trackiq.rail.in', '9876543210', 'Google Passenger');
      setLoading(false);
    }, 300);
  };

  const handleQuickDemoFill = (type: 'passenger' | 'business') => {
    if (type === 'passenger') {
      setEmail('rahul.sharma@railmail.in');
      setMobile('9876543210');
      setName('Rahul Sharma');
    } else {
      setEmail('priya.patel@corridor.org');
      setMobile('9123456780');
      setName('Priya Patel');
    }
    setError(null);
  };

  const displayTitle = isSignInMode ? 'Sign in to TrackIQ' : (authTitle || 'Almost there.');
  const displaySubtitle = isSignInMode
    ? 'Enter your registered email & mobile to continue.'
    : (authSubtitle || 'Enter your details to continue.');

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
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuthModal();
      }}
    >
      <div
        className="card animate-fadeIn"
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'var(--bg-panel)',
          borderColor: 'rgba(56, 189, 248, 0.4)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)',
          padding: 24,
        }}
      >
        {/* Header with TrackIQ Brand */}
        <div className="flex items-center justify-between pb-3 mb-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-2">
            <div className="navbar-logo-badge" style={{ width: 32, height: 32, fontSize: '0.8rem', background: '#0284c7', color: '#ffffff', fontWeight: 800 }}>
              TQ
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f1f5f9' }}>
                {displayTitle}
              </h2>
              <div className="text-xs text-muted">
                {displaySubtitle}
              </div>
            </div>
          </div>
          <button
            className="btn btn-sm btn-secondary"
            onClick={closeAuthModal}
            style={{ fontSize: '1.1rem', padding: '2px 8px', lineHeight: 1 }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Context-Aware Explanation Box */}
        {authContextMessage && (
          <div
            style={{
              background: 'rgba(6, 182, 212, 0.12)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              marginBottom: 16,
              fontSize: '0.8rem',
              color: '#a5f3fc',
              lineHeight: 1.4,
            }}
          >
            <strong>ℹ️ Why authentication is needed:</strong> {authContextMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {!isSignInMode && (
            <div style={{ marginBottom: 12 }}>
              <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
                Full Name (Optional):
              </label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
          )}

          <div style={{ marginBottom: 12 }}>
            <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
              Email Address:
            </label>
            <input
              type="email"
              placeholder="passenger@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: error && !email ? '1px solid var(--rail-critical)' : '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontSize: '0.88rem',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="text-xs text-muted mono uppercase mb-1" style={{ display: 'block' }}>
              Mobile Number:
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <span
                style={{
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 10px',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                🇮🇳 +91
              </span>
              <input
                type="tel"
                placeholder="9876543210"
                maxLength={10}
                value={mobile}
                onChange={(e) => {
                  setMobile(e.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
                style={{
                  flex: 1,
                  background: 'var(--bg-input)',
                  border: error && !mobile ? '1px solid var(--rail-critical)' : '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
          </div>

          {error && (
            <div
              className="text-xs mb-3 animate-fadeIn"
              style={{
                color: 'var(--rail-critical)',
                background: 'rgba(239, 68, 68, 0.1)',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: '0.9rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading
              ? 'Authenticating...'
              : isSignInMode
              ? 'Sign In & Continue'
              : authButtonText || 'Continue'}
          </button>
        </form>

        {/* Social / Alternative Demo login */}
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleGoogleDemoAuth}
            disabled={loading}
            style={{
              width: '100%',
              fontSize: '0.8rem',
              padding: '7px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: 'var(--bg-canvas)',
              borderColor: 'var(--border-default)',
            }}
          >
            <span>🌐</span> Continue with Google (Demo)
          </button>
        </div>

        {/* Toggle sign in / register */}
        <div className="text-center mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
          {isSignInMode ? (
            <span className="text-muted">
              New passenger?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignInMode(false);
                  setError(null);
                }}
                style={{ color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              >
                Create Account / Register
              </button>
            </span>
          ) : (
            <span className="text-muted">
              Already registered?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignInMode(true);
                  setError(null);
                }}
                style={{ color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              >
                Sign in
              </button>
            </span>
          )}
        </div>

        {/* Quick Demo Pre-fill for Hackathon Evaluation */}
        <div
          style={{
            marginTop: 14,
            padding: '8px 10px',
            background: 'var(--bg-canvas)',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-default)',
            fontSize: '0.72rem',
          }}
        >
          <div className="flex items-center justify-between text-muted mono uppercase mb-1">
            <span>⚡ Demo Quick-Fill:</span>
            <span style={{ color: '#38bdf8' }}>SIH26028 TEST SUITE</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.7rem', padding: '3px 8px', flex: 1 }}
              onClick={() => handleQuickDemoFill('passenger')}
            >
              Rahul Sharma (Passenger)
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.7rem', padding: '3px 8px', flex: 1 }}
              onClick={() => handleQuickDemoFill('business')}
            >
              Priya Patel (Business)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
