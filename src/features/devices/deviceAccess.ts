import type { TFunction } from 'i18next';
import { providerLabel } from '@/features/dashboard/utils';
import type { Device, DeviceAccount } from '@/services/api';

/** Display name for a provider key ("claude" → "Claude"). */
export const providerName = (id: string): string => providerLabel(id, id || '?');

/** Best human label for an account: email, then label, then file name, then id. */
export const accountName = (account: DeviceAccount): string =>
  account.email || account.label || account.name || account.id;

/**
 * Short access summary for a device ("Claude only", "1 account"), or null when the device may
 * use every provider and account.
 */
export function accessSummary(
  device: Pick<Device, 'allowedProviders' | 'allowedAuths' | 'allowedModels'>,
  t: TFunction
): string | null {
  if (device.allowedAuths.length > 0) {
    return t('devices.access_badge_accounts', { count: device.allowedAuths.length });
  }
  if (device.allowedProviders.length === 1) {
    return t('devices.access_badge_only', { provider: providerName(device.allowedProviders[0]) });
  }
  if (device.allowedProviders.length > 1) {
    return device.allowedProviders.map(providerName).join(' + ');
  }
  if (device.allowedModels.length > 0) {
    return t('devices.access_badge_models', { count: device.allowedModels.length });
  }
  return null;
}

/** Longer description for a tooltip: providers, accounts and model patterns. */
export function accessDetail(
  device: Pick<Device, 'allowedProviders' | 'allowedAuths' | 'allowedModels'>,
  accounts: DeviceAccount[],
  t: TFunction
): string {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const parts: string[] = [];
  if (device.allowedProviders.length > 0) {
    parts.push(
      t('devices.access_detail_providers', {
        list: device.allowedProviders.map(providerName).join(', '),
      })
    );
  }
  if (device.allowedAuths.length > 0) {
    parts.push(
      t('devices.access_detail_accounts', {
        list: device.allowedAuths
          .map((id) => {
            const account = byId.get(id);
            return account ? `${providerName(account.provider)} · ${accountName(account)}` : id;
          })
          .join(', '),
      })
    );
  }
  if (device.allowedModels.length > 0) {
    parts.push(t('devices.access_detail_models', { list: device.allowedModels.join(', ') }));
  }
  return parts.join('\n');
}

/** Parses a comma/newline separated list of model patterns. */
export const parseModelPatterns = (text: string): string[] => [
  ...new Set(
    text
      .split(/[\n,]/)
      .map((part) => part.trim())
      .filter(Boolean)
  ),
];
