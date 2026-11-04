import { describe, expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import { normalizeDevice } from '@/services/api/devices';
import { accessSummary, parseModelPatterns } from '@/features/devices/deviceAccess';

const t = ((key: string, options?: Record<string, unknown>) =>
  `${key}${options ? JSON.stringify(options) : ''}`) as unknown as TFunction;

describe('device access', () => {
  test('normalizes access lists and defaults them to empty arrays', () => {
    const device = normalizeDevice({
      id: 'd1',
      allowed_providers: ['claude', '', 3],
      allowed_auths: ['codex-1.json'],
    });
    expect(device?.allowedProviders).toEqual(['claude']);
    expect(device?.allowedAuths).toEqual(['codex-1.json']);
    expect(device?.allowedModels).toEqual([]);
    expect(normalizeDevice({ id: 'd2' })?.allowedProviders).toEqual([]);
  });

  test('summarizes restrictions for the row badge', () => {
    const base = { allowedProviders: [], allowedAuths: [], allowedModels: [] };
    expect(accessSummary(base, t)).toBeNull();
    expect(accessSummary({ ...base, allowedProviders: ['claude'] }, t)).toBe(
      'devices.access_badge_only{"provider":"Claude"}'
    );
    expect(accessSummary({ ...base, allowedProviders: ['claude', 'codex'] }, t)).toBe(
      'Claude + Codex'
    );
    expect(accessSummary({ ...base, allowedProviders: ['codex'], allowedAuths: ['a'] }, t)).toBe(
      'devices.access_badge_accounts{"count":1}'
    );
  });

  test('parses model patterns', () => {
    expect(parseModelPatterns(' gpt-*, claude-sonnet-*\ngpt-*,, ')).toEqual([
      'gpt-*',
      'claude-sonnet-*',
    ]);
  });
});
