import type { Device } from '@/services/api/devices';

export type DeviceStatus = 'active' | 'disabled' | 'limited';

export const formatUsd = (value: number): string => {
  if (value > 0 && value < 0.01) return '<$0.01';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatTokens = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
};

export const maskKey = (key: string): string =>
  key.length <= 14 ? key : `${key.slice(0, 10)}…${key.slice(-4)}`;

/** Share of the monthly limit spent, 0..1, or null when unlimited. */
export const spendRatio = (device: Device): number | null =>
  device.monthlyLimitUsd > 0 ? Math.min(1, device.usage.costUsd / device.monthlyLimitUsd) : null;

export const deviceStatus = (device: Device): DeviceStatus => {
  if (device.disabled) return 'disabled';
  if (device.monthlyLimitUsd > 0 && device.usage.costUsd >= device.monthlyLimitUsd) {
    return 'limited';
  }
  return 'active';
};

/** Short USD for axes and dense labels: $0, $0.50, $12, $1.2k. */
export const formatUsdCompact = (value: number): string => {
  if (value === 0) return '$0';
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  if (value >= 10) return `$${Math.round(value)}`;
  if (value >= 1) return `$${value.toFixed(1).replace(/\.0$/, '')}`;
  return `$${value.toFixed(2)}`;
};

export const formatPercent = (value: number | null, digits = 1): string => {
  if (value === null || !Number.isFinite(value)) return '—';
  const pct = value * 100;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  return `${pct.toFixed(pct >= 99.95 || pct === 0 ? 0 : digits)}%`;
};

export const formatSignedPercent = (value: number): string =>
  `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value * 100).toFixed(Math.abs(value) >= 1 ? 0 : 1)}%`;

export const formatCount = (value: number): string => value.toLocaleString('en-US');

export const formatMonthLabel = (month: string, locale?: string): string => {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export const formatDayLabel = (day: string, locale?: string): string => {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};
