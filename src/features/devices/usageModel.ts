import type { DeviceDayUsage, DeviceMonthUsage } from '@/services/api/devices';

/** Number of categorical series slots; further devices fold into "Other". */
export const SERIES_SLOTS = 7;
export const OTHER_SERIES = '__other__';

export interface MonthWindow {
  month: string;
  days: string[];
  /** Days of the month elapsed so far (fractional), or the full length for past months. */
  elapsedDays: number;
  isCurrent: boolean;
  /** Index into `days` of today, or -1 when the month is not the current one. */
  todayIndex: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export const monthWindow = (month: string, now: Date = new Date()): MonthWindow => {
  const total = daysInMonth(month);
  const days = Array.from({ length: total }, (_, i) => `${month}-${pad(i + 1)}`);
  const nowMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const isCurrent = nowMonth === month;
  if (!isCurrent) {
    return { month, days, elapsedDays: month < nowMonth ? total : 0, isCurrent, todayIndex: -1 };
  }
  const dayFraction = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
  const elapsed = now.getDate() - 1 + dayFraction;
  return {
    month,
    days,
    elapsedDays: Math.max(1, elapsed),
    isCurrent,
    todayIndex: now.getDate() - 1,
  };
};

export const previousMonth = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

/** Linear run-rate projection of month-end spend; past months return the actual value. */
export const projectMonthEnd = (cost: number, window: MonthWindow): number => {
  if (!window.isCurrent) return cost;
  return (cost / window.elapsedDays) * window.days.length;
};

export const emptyUsage = (): DeviceMonthUsage => ({
  requests: 0,
  failedRequests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
  byModel: [],
  byDay: [],
});

export const totalTokens = (u: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}) => u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;

/** Share of prompt tokens served from cache, or null without prompt tokens. */
export const cacheHitRate = (u: { inputTokens: number; cacheReadTokens: number }) => {
  const denom = u.inputTokens + u.cacheReadTokens;
  return denom > 0 ? u.cacheReadTokens / denom : null;
};

export const successRate = (u: { requests: number; failedRequests: number }) =>
  u.requests > 0 ? (u.requests - u.failedRequests) / u.requests : null;

/** Sums several devices' month usage into one, merging models and days. */
export const sumUsage = (list: DeviceMonthUsage[]): DeviceMonthUsage => {
  const out = emptyUsage();
  const models = new Map<string, DeviceMonthUsage['byModel'][number]>();
  const days = new Map<string, DeviceDayUsage>();
  for (const u of list) {
    out.requests += u.requests;
    out.failedRequests += u.failedRequests;
    out.inputTokens += u.inputTokens;
    out.outputTokens += u.outputTokens;
    out.cacheReadTokens += u.cacheReadTokens;
    out.cacheWriteTokens += u.cacheWriteTokens;
    out.costUsd += u.costUsd;
    for (const m of u.byModel) {
      const prev = models.get(m.model);
      models.set(
        m.model,
        prev
          ? {
              model: m.model,
              requests: prev.requests + m.requests,
              failedRequests: prev.failedRequests + m.failedRequests,
              inputTokens: prev.inputTokens + m.inputTokens,
              outputTokens: prev.outputTokens + m.outputTokens,
              cacheReadTokens: prev.cacheReadTokens + m.cacheReadTokens,
              cacheWriteTokens: prev.cacheWriteTokens + m.cacheWriteTokens,
              costUsd: prev.costUsd + m.costUsd,
            }
          : { ...m }
      );
    }
    for (const d of u.byDay) {
      const prev = days.get(d.day);
      days.set(
        d.day,
        prev
          ? {
              day: d.day,
              detailed: prev.detailed && d.detailed,
              requests: prev.requests + d.requests,
              failedRequests: prev.failedRequests + d.failedRequests,
              inputTokens: prev.inputTokens + d.inputTokens,
              outputTokens: prev.outputTokens + d.outputTokens,
              cacheReadTokens: prev.cacheReadTokens + d.cacheReadTokens,
              cacheWriteTokens: prev.cacheWriteTokens + d.cacheWriteTokens,
              costUsd: prev.costUsd + d.costUsd,
            }
          : { ...d }
      );
    }
  }
  out.byModel = [...models.values()].sort((a, b) => b.costUsd - a.costUsd);
  out.byDay = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  return out;
};

/** Cost spent up to and including day-of-month `uptoDay` (1-based). */
export const costThroughDay = (usage: DeviceMonthUsage, uptoDay: number): number =>
  usage.byDay.reduce(
    (sum, d) => (Number(d.day.slice(8, 10)) <= uptoDay ? sum + d.costUsd : sum),
    0
  );

/** Daily cost aligned to every day of the window. */
export const dailySeries = (usage: DeviceMonthUsage, window: MonthWindow): number[] => {
  const map = new Map(usage.byDay.map((d) => [d.day, d.costUsd]));
  return window.days.map((day) => map.get(day) ?? 0);
};

export interface StackSeries {
  key: string;
  name: string;
  slot: number | null;
  values: number[];
  total: number;
}

/**
 * Builds stacked daily series in fixed entity order. Devices keep their slot
 * (index in creation order) so colors never shift with ranking; devices past
 * the slot count fold into one "Other" series.
 */
export const stackSeries = (
  entries: { id: string; name: string; usage: DeviceMonthUsage }[],
  window: MonthWindow,
  otherLabel: string
): StackSeries[] => {
  const series: StackSeries[] = [];
  let other: StackSeries | null = null;
  entries.forEach((entry, index) => {
    const values = dailySeries(entry.usage, window);
    if (index < SERIES_SLOTS) {
      series.push({
        key: entry.id,
        name: entry.name,
        slot: index,
        values,
        total: values.reduce((a, b) => a + b, 0),
      });
      return;
    }
    if (!other) {
      other = {
        key: OTHER_SERIES,
        name: otherLabel,
        slot: null,
        values: values.map(() => 0),
        total: 0,
      };
    }
    values.forEach((v, i) => {
      other!.values[i] += v;
      other!.total += v;
    });
  });
  if (other) series.push(other);
  return series;
};

/** Rounds a max value up to a pleasant axis maximum and returns ~4 ticks. */
export const niceTicks = (max: number, count = 4): number[] => {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
};

/** Relative change, or null when there is no baseline. */
export const relativeChange = (current: number, previous: number): number | null =>
  previous > 0 ? (current - previous) / previous : null;
