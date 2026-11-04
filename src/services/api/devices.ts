import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

export interface DeviceModelUsage {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface DeviceMonthUsage {
  requests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  byModel: DeviceModelUsage[];
  /** Sorted ascending by day ("YYYY-MM-DD"). */
  byDay: { day: string; costUsd: number }[];
}

export interface Device {
  id: string;
  name: string;
  key: string;
  monthlyLimitUsd: number;
  disabled: boolean;
  note: string;
  createdAt: string;
  lastUsedAt: string | null;
  month: string;
  usage: DeviceMonthUsage;
}

export interface DevicePriceRule {
  match: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface DevicePricing {
  rules: DevicePriceRule[];
  isDefault: boolean;
  defaults: DevicePriceRule[];
}

export interface DeviceUpdate {
  name?: string;
  monthlyLimitUsd?: number;
  disabled?: boolean;
  note?: string;
}

const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

export const normalizeMonthUsage = (value: unknown): DeviceMonthUsage => {
  const raw = isRecord(value) ? value : {};
  const byModelRaw = isRecord(raw.by_model) ? raw.by_model : {};
  const byDayRaw = isRecord(raw.by_day) ? raw.by_day : {};
  return {
    requests: num(raw.requests),
    failedRequests: num(raw.failed_requests),
    inputTokens: num(raw.input_tokens),
    outputTokens: num(raw.output_tokens),
    cacheReadTokens: num(raw.cache_read_tokens),
    cacheWriteTokens: num(raw.cache_write_tokens),
    costUsd: num(raw.cost_usd),
    byModel: Object.entries(byModelRaw)
      .map(([model, entry]) => {
        const m = isRecord(entry) ? entry : {};
        return {
          model,
          requests: num(m.requests),
          inputTokens: num(m.input_tokens),
          outputTokens: num(m.output_tokens),
          costUsd: num(m.cost_usd),
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd),
    byDay: Object.entries(byDayRaw)
      .map(([day, cost]) => ({ day, costUsd: num(cost) }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
};

export const normalizeDevice = (value: unknown): Device | null => {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  if (!id) return null;
  return {
    id,
    name: str(value.name),
    key: str(value.key),
    monthlyLimitUsd: num(value.monthly_limit_usd),
    disabled: value.disabled === true,
    note: str(value.note),
    createdAt: str(value.created_at),
    lastUsedAt: str(value.last_used_at).startsWith('0001-') ? null : str(value.last_used_at) || null,
    month: str(value.month),
    usage: normalizeMonthUsage(value.usage),
  };
};

const normalizeRule = (value: unknown): DevicePriceRule | null => {
  if (!isRecord(value)) return null;
  const match = str(value.match).trim();
  if (!match) return null;
  return {
    match,
    input: num(value.input),
    output: num(value.output),
    cacheWrite: num(value.cache_write),
    cacheRead: num(value.cache_read),
  };
};

const normalizeRules = (value: unknown): DevicePriceRule[] =>
  Array.isArray(value)
    ? (value.map(normalizeRule).filter(Boolean) as DevicePriceRule[])
    : [];

const normalizePricing = (value: unknown): DevicePricing => {
  const raw = isRecord(value) ? value : {};
  return {
    rules: normalizeRules(raw.rules),
    isDefault: raw.is_default === true,
    defaults: normalizeRules(raw.defaults),
  };
};

const deviceFromResponse = (value: unknown): Device => {
  const device = normalizeDevice(isRecord(value) ? value.device : null);
  if (!device) throw new Error('Invalid device response');
  return device;
};

export const devicesApi = {
  async list(): Promise<Device[]> {
    const data = await apiClient.get<unknown>('/devices');
    const list = isRecord(data) && Array.isArray(data.devices) ? data.devices : [];
    return list.map(normalizeDevice).filter(Boolean) as Device[];
  },

  async create(input: { name: string; monthlyLimitUsd: number; note?: string }) {
    const data = await apiClient.post<unknown>('/devices', {
      name: input.name,
      monthly_limit_usd: input.monthlyLimitUsd,
      note: input.note ?? '',
    });
    return deviceFromResponse(data);
  },

  async update(id: string, patch: DeviceUpdate) {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.monthlyLimitUsd !== undefined) body.monthly_limit_usd = patch.monthlyLimitUsd;
    if (patch.disabled !== undefined) body.disabled = patch.disabled;
    if (patch.note !== undefined) body.note = patch.note;
    const data = await apiClient.patch<unknown>(`/devices/${encodeURIComponent(id)}`, body);
    return deviceFromResponse(data);
  },

  remove: (id: string) => apiClient.delete(`/devices/${encodeURIComponent(id)}`),

  async rotateKey(id: string) {
    const data = await apiClient.post<unknown>(`/devices/${encodeURIComponent(id)}/rotate-key`);
    return deviceFromResponse(data);
  },

  resetUsage: (id: string) => apiClient.post(`/devices/${encodeURIComponent(id)}/reset-usage`),

  async getPricing(): Promise<DevicePricing> {
    return normalizePricing(await apiClient.get<unknown>('/devices/pricing'));
  },

  async savePricing(rules: DevicePriceRule[]): Promise<DevicePricing> {
    const data = await apiClient.put<unknown>('/devices/pricing', {
      rules: rules.map((rule) => ({
        match: rule.match,
        input: rule.input,
        output: rule.output,
        cache_write: rule.cacheWrite,
        cache_read: rule.cacheRead,
      })),
    });
    return normalizePricing(data);
  },
};
