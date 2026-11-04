import { describe, expect, test } from 'bun:test';
import { normalizeMonthUsage } from '@/services/api/devices';
import {
  SERIES_SLOTS,
  OTHER_SERIES,
  cacheHitRate,
  costThroughDay,
  monthWindow,
  niceTicks,
  previousMonth,
  projectMonthEnd,
  stackSeries,
  sumUsage,
} from '@/features/devices/usageModel';

const usage = (days: Record<string, number>, extra: Record<string, unknown> = {}) =>
  normalizeMonthUsage({
    cost_usd: Object.values(days).reduce((a, b) => a + b, 0),
    by_day: days,
    ...extra,
  });

describe('device usage model', () => {
  test('normalizes detailed days and falls back to cost-only days', () => {
    const u = normalizeMonthUsage({
      by_day: { '2026-11-01': 1, '2026-11-02': 2 },
      days: {
        '2026-11-02': { requests: 3, failed_requests: 1, cache_read_tokens: 10, cost_usd: 2 },
      },
      by_model: { a: { requests: 1, cache_read_tokens: 5, cost_usd: 1 } },
    });
    expect(u.byDay.map((d) => [d.day, d.detailed, d.requests, d.costUsd])).toEqual([
      ['2026-11-01', false, 0, 1],
      ['2026-11-02', true, 3, 2],
    ]);
    expect(u.byModel[0].cacheReadTokens).toBe(5);
  });

  test('projects month-end spend linearly only for the current month', () => {
    const now = new Date(2026, 10, 4, 12, 0);
    const win = monthWindow('2026-11', now);
    expect(win.days).toHaveLength(30);
    expect(win.todayIndex).toBe(3);
    expect(win.elapsedDays).toBeCloseTo(3.5);
    expect(projectMonthEnd(7, win)).toBeCloseTo(60);
    const past = monthWindow('2026-10', now);
    expect(past.isCurrent).toBe(false);
    expect(projectMonthEnd(7, past)).toBe(7);
  });

  test('previous month wraps the year', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-11')).toBe('2026-10');
  });

  test('sums usage and compares through a day of month', () => {
    const total = sumUsage([
      usage(
        { '2026-10-01': 1, '2026-10-05': 2 },
        { requests: 2, input_tokens: 30, cache_read_tokens: 70 }
      ),
      usage({ '2026-10-01': 0.5 }, { requests: 1 }),
    ]);
    expect(total.requests).toBe(3);
    expect(total.byDay[0].costUsd).toBeCloseTo(1.5);
    expect(costThroughDay(total, 4)).toBeCloseTo(1.5);
    expect(cacheHitRate(total)).toBeCloseTo(0.7);
    expect(cacheHitRate({ inputTokens: 0, cacheReadTokens: 0 })).toBeNull();
  });

  test('stacks devices in fixed slots and folds extras into Other', () => {
    const win = monthWindow('2026-10', new Date(2026, 10, 4));
    const entries = Array.from({ length: SERIES_SLOTS + 2 }, (_, i) => ({
      id: `d${i}`,
      name: `D${i}`,
      usage: usage({ '2026-10-02': i + 1 }),
    }));
    const series = stackSeries(entries, win, 'Other');
    expect(series).toHaveLength(SERIES_SLOTS + 1);
    expect(series[0].slot).toBe(0);
    const other = series[series.length - 1];
    expect(other.key).toBe(OTHER_SERIES);
    expect(other.values[1]).toBe(SERIES_SLOTS + 1 + SERIES_SLOTS + 2);
  });

  test('nice ticks cover the max', () => {
    const ticks = niceTicks(13.2);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(13.2);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});
