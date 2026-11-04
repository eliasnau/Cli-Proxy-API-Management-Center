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
  device.monthlyLimitUsd > 0
    ? Math.min(1, device.usage.costUsd / device.monthlyLimitUsd)
    : null;

export const deviceStatus = (device: Device): DeviceStatus => {
  if (device.disabled) return 'disabled';
  if (device.monthlyLimitUsd > 0 && device.usage.costUsd >= device.monthlyLimitUsd) {
    return 'limited';
  }
  return 'active';
};
