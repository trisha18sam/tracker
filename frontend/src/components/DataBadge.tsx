import React from 'react';

export interface DataBadgeProps {
  sourceType?: 'LIVE_API' | 'DATABASE' | 'PREDICTION' | 'SIMULATED' | 'IRCTC_OFFICIAL_TARIFF' | 'VENDOR_DEMO' | string;
  isSimulated?: boolean;
  lastUpdated?: string;
  label?: string;
  className?: string;
}

export const DataBadge: React.FC<DataBadgeProps> = ({
  sourceType = 'DATABASE',
  isSimulated = false,
  lastUpdated,
  label,
  className = '',
}) => {
  let badgeColor = '#38bdf8';
  let badgeBg = 'rgba(56, 189, 248, 0.12)';
  let icon = '◇';
  let text = label || 'DATABASE';

  if (sourceType === 'LIVE_API' || sourceType === 'LIVE') {
    badgeColor = '#10b981';
    badgeBg = 'rgba(16, 185, 129, 0.15)';
    icon = '●';
    text = label || 'LIVE DATA';
  } else if (sourceType === 'PREDICTION') {
    badgeColor = '#a855f7';
    badgeBg = 'rgba(168, 85, 247, 0.15)';
    icon = '✦';
    text = label || 'ML PREDICTED';
  } else if (sourceType === 'IRCTC_OFFICIAL_TARIFF') {
    badgeColor = '#06b6d4';
    badgeBg = 'rgba(6, 182, 212, 0.15)';
    icon = '🏛️';
    text = label || 'IRCTC OFFICIAL TARIFF';
  } else if (sourceType === 'VENDOR_DEMO' || isSimulated || sourceType === 'SIMULATED') {
    badgeColor = '#f59e0b';
    badgeBg = 'rgba(245, 158, 11, 0.15)';
    icon = '○';
    text = label || (sourceType === 'VENDOR_DEMO' ? 'VENDOR DEMO' : 'DEMO / SIMULATED');
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-bold tracking-wide ${className}`}
      style={{
        color: badgeColor,
        background: badgeBg,
        border: `1px solid ${badgeColor}40`,
      }}
      title={lastUpdated ? `Last updated: ${new Date(lastUpdated).toLocaleTimeString()}` : undefined}
    >
      <span style={{ fontSize: '0.8em', lineHeight: 1 }}>{icon}</span>
      <span>{text}</span>
      {lastUpdated && (
        <span className="opacity-70 text-[10px] ml-1 font-normal">
          {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </span>
  );
};
