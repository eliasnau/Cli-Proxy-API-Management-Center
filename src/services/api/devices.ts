import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

export interface DeviceModelUsage {
  model: string;
  requests: number;
  failedRequests: number;
  /** Includes cache reads and writes. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export interface DeviceDayUsage {
  /** "YYYY-MM-DD" */
  day: string;
  /** False when the backend only recorded the day's cost (older data). */
  detailed: boolean;
  requests: number;
  failedRequests: number;
  /** Uncached input only, like the month-level field. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
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
  byDay: DeviceDayUsage[];
}

export interface DeviceMonthReportEntry {
  id: string;
  name: string;
  monthlyLimitUsd: number;
  disabled: boolean;
  usage: DeviceMonthUsage;
}

export interface DeviceUsageReport {
  month: string;
  currentMonth: string;
  /** Newest first; always contains the current month. */
  months: string[];
  devices: DeviceMonthReportEntry[];
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
  /** Provider keys this device may use ("claude", "codex", ...); empty = all. */
  allowedProviders: string[];
  /** Specific auth IDs this device may use; empty = any of the allowed providers. */
  allowedAuths: string[];
  /** Model glob patterns this device may use; empty = all. */
  allowedModels: string[];
}

/** A credential a device can be restricted to (GET /devices/accounts). */
export interface DeviceAccount {
  id: string;
  provider: string;
  label: string;
  email: string;
  name: string;
  disabled: boolean;
}

export interface DeviceAccess {
  allowedProviders: string[];
  allowedAuths: string[];
  allowedModels: string[];
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

export interface DeviceUpdate extends Partial<DeviceAccess> {
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

const strList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map(str)
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

const normalizeDay = (day: string, cost: unknown, detail: unknown): DeviceDayUsage => {
  const d = isRecord(detail) ? detail : null;
  return {
    day,
    detailed: d !== null,
    requests: num(d?.requests),
    failedRequests: num(d?.failed_requests),
    inputTokens: num(d?.input_tokens),
    outputTokens: num(d?.output_tokens),
    cacheReadTokens: num(d?.cache_read_tokens),
    cacheWriteTokens: num(d?.cache_write_tokens),
    costUsd: d ? num(d.cost_usd) : num(cost),
  };
};

export const normalizeMonthUsage = (value: unknown): DeviceMonthUsage => {
  const raw = isRecord(value) ? value : {};
  const byModelRaw = isRecord(raw.by_model) ? raw.by_model : {};
  const byDayRaw = isRecord(raw.by_day) ? raw.by_day : {};
  const daysRaw = isRecord(raw.days) ? raw.days : {};
  const dayKeys = new Set([...Object.keys(byDayRaw), ...Object.keys(daysRaw)]);
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
          failedRequests: num(m.failed_requests),
          inputTokens: num(m.input_tokens),
          outputTokens: num(m.output_tokens),
          cacheReadTokens: num(m.cache_read_tokens),
          cacheWriteTokens: num(m.cache_write_tokens),
          costUsd: num(m.cost_usd),
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd),
    byDay: [...dayKeys]
      .map((day) => normalizeDay(day, byDayRaw[day], daysRaw[day]))
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
    lastUsedAt: str(value.last_used_at).startsWith('0001-')
      ? null
      : str(value.last_used_at) || null,
    month: str(value.month),
    usage: normalizeMonthUsage(value.usage),
    allowedProviders: strList(value.allowed_providers),
    allowedAuths: strList(value.allowed_auths),
    allowedModels: strList(value.allowed_models),
  };
};

const normalizeAccount = (value: unknown): DeviceAccount | null => {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  if (!id) return null;
  return {
    id,
    provider: str(value.provider).toLowerCase(),
    label: str(value.label),
    email: str(value.email),
    name: str(value.name),
    disabled: value.disabled === true,
  };
};

const normalizeReport = (value: unknown): DeviceUsageReport => {
  const raw = isRecord(value) ? value : {};
  const list = Array.isArray(raw.devices) ? raw.devices : [];
  const currentMonth = str(raw.current_month);
  const months = Array.isArray(raw.months) ? raw.months.map(str).filter(Boolean) : [];
  return {
    month: str(raw.month) || currentMonth,
    currentMonth,
    months: months.length > 0 ? months : currentMonth ? [currentMonth] : [],
    devices: list.flatMap((entry) => {
      if (!isRecord(entry) || !str(entry.id)) return [];
      return [
        {
          id: str(entry.id),
          name: str(entry.name),
          monthlyLimitUsd: num(entry.monthly_limit_usd),
          disabled: entry.disabled === true,
          usage: normalizeMonthUsage(entry.usage),
        },
      ];
    }),
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
  Array.isArray(value) ? (value.map(normalizeRule).filter(Boolean) as DevicePriceRule[]) : [];

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

  async create(
    input: { name: string; monthlyLimitUsd: number; note?: string } & Partial<DeviceAccess>
  ) {
    const data = await apiClient.post<unknown>('/devices', {
      name: input.name,
      monthly_limit_usd: input.monthlyLimitUsd,
      note: input.note ?? '',
      allowed_providers: input.allowedProviders ?? [],
      allowed_auths: input.allowedAuths ?? [],
      allowed_models: input.allowedModels ?? [],
    });
    return deviceFromResponse(data);
  },

  async update(id: string, patch: DeviceUpdate) {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.monthlyLimitUsd !== undefined) body.monthly_limit_usd = patch.monthlyLimitUsd;
    if (patch.disabled !== undefined) body.disabled = patch.disabled;
    if (patch.note !== undefined) body.note = patch.note;
    // Empty arrays clear a restriction; omitted fields stay unchanged.
    if (patch.allowedProviders !== undefined) body.allowed_providers = patch.allowedProviders;
    if (patch.allowedAuths !== undefined) body.allowed_auths = patch.allowedAuths;
    if (patch.allowedModels !== undefined) body.allowed_models = patch.allowedModels;
    const data = await apiClient.patch<unknown>(`/devices/${encodeURIComponent(id)}`, body);
    return deviceFromResponse(data);
  },

  /** All devices' usage for one month ("YYYY-MM"); omit for the current month. */
  async usage(month?: string): Promise<DeviceUsageReport> {
    const query = month ? `?month=${encodeURIComponent(month)}` : '';
    return normalizeReport(await apiClient.get<unknown>(`/devices/usage${query}`));
  },

  /** Every recorded month for one device, newest first. */
  async history(id: string): Promise<{ month: string; usage: DeviceMonthUsage }[]> {
    const data = await apiClient.get<unknown>(`/devices/${encodeURIComponent(id)}/history`);
    const months = isRecord(data) && isRecord(data.months) ? data.months : {};
    return Object.entries(months)
      .map(([month, usage]) => ({ month, usage: normalizeMonthUsage(usage) }))
      .sort((a, b) => b.month.localeCompare(a.month));
  },

  /** Credentials a device can be restricted to, plus the providers that have any. */
  async accounts(): Promise<{ accounts: DeviceAccount[]; providers: string[] }> {
    const data = await apiClient.get<unknown>('/devices/accounts');
    const raw = isRecord(data) ? data : {};
    const accounts = Array.isArray(raw.accounts)
      ? (raw.accounts.map(normalizeAccount).filter(Boolean) as DeviceAccount[])
      : [];
    const providers = strList(raw.providers).map((p) => p.toLowerCase());
    return {
      accounts,
      providers: providers.length > 0 ? providers : [...new Set(accounts.map((a) => a.provider))],
    };
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
