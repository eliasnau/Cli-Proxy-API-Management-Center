import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconCopy,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconPlus,
  IconRefreshCw,
  IconTrash2,
} from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { devicesApi, type Device, type DevicePriceRule } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import { getErrorMessage } from '@/utils/helpers';
import { deviceStatus, formatTokens, formatUsd, maskKey, spendRatio } from './deviceFormat';
import styles from './DevicesPage.module.scss';

interface DeviceDraft {
  id: string | null;
  name: string;
  limit: string;
  note: string;
}

const emptyDraft: DeviceDraft = { id: null, name: '', limit: '', note: '' };

export function DevicesPage() {
  const { t } = useTranslation();
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const apiBase = useAuthStore((state) => state.apiBase);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DeviceDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [newKeyDevice, setNewKeyDevice] = useState<Device | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDevices(await devicesApi.list());
    } catch (error) {
      showNotification(getErrorMessage(error, t('devices.load_failed')), 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification, t]);

  useHeaderRefresh(load, connected);
  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  const totals = useMemo(() => {
    const spent = devices.reduce((sum, d) => sum + d.usage.costUsd, 0);
    const requests = devices.reduce((sum, d) => sum + d.usage.requests, 0);
    const limited = devices.filter((d) => deviceStatus(d) === 'limited').length;
    return { spent, requests, limited };
  }, [devices]);

  const replaceDevice = (next: Device) =>
    setDevices((list) => list.map((d) => (d.id === next.id ? { ...d, ...next, usage: d.usage } : d)));

  const copy = async (text: string) => {
    const ok = await copyToClipboard(text);
    showNotification(ok ? t('devices.copied') : t('devices.copy_failed'), ok ? 'success' : 'error');
  };

  const saveDraft = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const limit = draft.limit.trim() === '' ? 0 : Number(draft.limit);
    if (!name || !Number.isFinite(limit) || limit < 0) {
      showNotification(t('devices.invalid_form'), 'error');
      return;
    }
    setSaving(true);
    try {
      if (draft.id) {
        replaceDevice(
          await devicesApi.update(draft.id, { name, monthlyLimitUsd: limit, note: draft.note })
        );
      } else {
        const created = await devicesApi.create({ name, monthlyLimitUsd: limit, note: draft.note });
        setNewKeyDevice(created);
        await load();
      }
      setDraft(null);
    } catch (error) {
      showNotification(getErrorMessage(error, t('devices.save_failed')), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleDisabled = async (device: Device, enabled: boolean) => {
    try {
      replaceDevice(await devicesApi.update(device.id, { disabled: !enabled }));
    } catch (error) {
      showNotification(getErrorMessage(error, t('devices.save_failed')), 'error');
    }
  };

  const confirmAction = (
    device: Device,
    kind: 'rotate' | 'reset' | 'delete',
    run: () => Promise<void>
  ) =>
    showConfirmation({
      title: t(`devices.confirm_${kind}_title`),
      message: t(`devices.confirm_${kind}_message`, { name: device.name }),
      confirmText: t(`devices.${kind}`),
      variant: kind === 'reset' ? 'primary' : 'danger',
      onConfirm: async () => {
        try {
          await run();
        } catch (error) {
          showNotification(getErrorMessage(error, t('devices.save_failed')), 'error');
        }
      },
    });

  const rotate = (device: Device) =>
    confirmAction(device, 'rotate', async () => {
      const next = await devicesApi.rotateKey(device.id);
      replaceDevice(next);
      setNewKeyDevice(next);
    });

  const reset = (device: Device) =>
    confirmAction(device, 'reset', async () => {
      await devicesApi.resetUsage(device.id);
      await load();
    });

  const remove = (device: Device) =>
    confirmAction(device, 'delete', async () => {
      await devicesApi.remove(device.id);
      setDevices((list) => list.filter((d) => d.id !== device.id));
    });

  const baseUrl = (apiBase || window.location.origin).replace(/\/+$/, '');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('devices.title')}</h1>
          <p className={styles.description}>{t('devices.description')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" onClick={() => setPricingOpen(true)}>
            {t('devices.pricing')}
          </Button>
          <Button size="sm" onClick={() => setDraft(emptyDraft)} disabled={!connected}>
            <IconPlus size={16} />
            {t('devices.add')}
          </Button>
        </div>
      </header>

      <section className={styles.stats}>
        <Stat label={t('devices.stat_spend')} value={formatUsd(totals.spent)} />
        <Stat label={t('devices.stat_devices')} value={String(devices.length)} />
        <Stat label={t('devices.stat_requests')} value={totals.requests.toLocaleString()} />
        <Stat
          label={t('devices.stat_limited')}
          value={String(totals.limited)}
          tone={totals.limited > 0 ? 'warn' : undefined}
        />
      </section>

      {loading && devices.length === 0 ? (
        <div className={styles.list}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <EmptyState
          title={t('devices.empty_title')}
          description={t('devices.empty_desc')}
          action={
            <Button size="sm" onClick={() => setDraft(emptyDraft)}>
              <IconPlus size={16} />
              {t('devices.add')}
            </Button>
          }
        />
      ) : (
        <div className={styles.list}>
          {devices.map((device) => {
            const status = deviceStatus(device);
            const ratio = spendRatio(device);
            const isOpen = expanded === device.id;
            return (
              <article key={device.id} className={styles.card}>
                <div className={styles.cardMain}>
                  <div className={styles.identity}>
                    <div className={styles.nameRow}>
                      <span className={styles.name}>{device.name}</span>
                      <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
                        {t(`devices.status_${status}`)}
                      </span>
                    </div>
                    <div className={styles.keyRow}>
                      <code className={styles.key}>
                        {revealed[device.id] ? device.key : maskKey(device.key)}
                      </code>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={revealed[device.id] ? t('devices.hide_key') : t('devices.show_key')}
                        onClick={() =>
                          setRevealed((r) => ({ ...r, [device.id]: !r[device.id] }))
                        }
                      >
                        {revealed[device.id] ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={t('devices.copy_key')}
                        onClick={() => void copy(device.key)}
                      >
                        <IconCopy size={15} />
                      </button>
                    </div>
                    {device.note ? <p className={styles.note}>{device.note}</p> : null}
                  </div>

                  <div className={styles.spend}>
                    <div className={styles.spendRow}>
                      <span className={styles.spendValue}>{formatUsd(device.usage.costUsd)}</span>
                      <span className={styles.spendLimit}>
                        {device.monthlyLimitUsd > 0
                          ? t('devices.of_limit', { limit: formatUsd(device.monthlyLimitUsd) })
                          : t('devices.no_limit')}
                      </span>
                    </div>
                    <div className={styles.bar} aria-hidden="true">
                      <div
                        className={`${styles.barFill} ${
                          ratio !== null && ratio >= 1
                            ? styles.barFull
                            : ratio !== null && ratio >= 0.8
                              ? styles.barWarn
                              : ''
                        }`}
                        style={{ width: `${(ratio ?? 0) * 100}%` }}
                      />
                    </div>
                    <div className={styles.meta}>
                      {t('devices.requests_count', { count: device.usage.requests })}
                      {' · '}
                      {formatTokens(device.usage.inputTokens + device.usage.cacheReadTokens + device.usage.cacheWriteTokens)}{' '}
                      {t('devices.in')} / {formatTokens(device.usage.outputTokens)} {t('devices.out')}
                      {' · '}
                      {device.lastUsedAt
                        ? t('devices.last_used', { when: new Date(device.lastUsedAt).toLocaleString() })
                        : t('devices.never_used')}
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <ToggleSwitch
                      checked={!device.disabled}
                      onChange={(value) => void toggleDisabled(device, value)}
                      ariaLabel={t('devices.enabled')}
                    />
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={t('devices.edit')}
                      onClick={() =>
                        setDraft({
                          id: device.id,
                          name: device.name,
                          limit: device.monthlyLimitUsd ? String(device.monthlyLimitUsd) : '',
                          note: device.note,
                        })
                      }
                    >
                      <IconPencil size={16} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={t('devices.rotate')}
                      title={t('devices.rotate')}
                      onClick={() => rotate(device)}
                    >
                      <IconRefreshCw size={16} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.danger}`}
                      aria-label={t('devices.delete')}
                      onClick={() => remove(device)}
                    >
                      <IconTrash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <button
                    type="button"
                    className={styles.linkButton}
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : device.id)}
                  >
                    {isOpen ? t('devices.hide_details') : t('devices.show_details')}
                  </button>
                  <button type="button" className={styles.linkButton} onClick={() => reset(device)}>
                    {t('devices.reset')}
                  </button>
                </div>

                {isOpen ? <DeviceDetails device={device} /> : null}
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={draft !== null}
        title={draft?.id ? t('devices.edit_title') : t('devices.add_title')}
        onClose={() => setDraft(null)}
        closeDisabled={saving}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void saveDraft()} loading={saving}>
              {draft?.id ? t('common.save') : t('devices.create')}
            </Button>
          </>
        }
      >
        {draft ? (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void saveDraft();
            }}
          >
            <Input
              label={t('devices.field_name')}
              value={draft.name}
              placeholder={t('devices.field_name_placeholder')}
              autoFocus
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              label={t('devices.field_limit')}
              hint={t('devices.field_limit_hint')}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={draft.limit}
              placeholder="0"
              onChange={(e) => setDraft({ ...draft, limit: e.target.value })}
            />
            <Input
              label={t('devices.field_note')}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
            <button type="submit" hidden />
          </form>
        ) : null}
      </Modal>

      <Modal
        open={newKeyDevice !== null}
        title={t('devices.key_title', { name: newKeyDevice?.name ?? '' })}
        onClose={() => setNewKeyDevice(null)}
        footer={<Button onClick={() => setNewKeyDevice(null)}>{t('devices.done')}</Button>}
      >
        {newKeyDevice ? (
          <div className={styles.keyModal}>
            <p className={styles.description}>{t('devices.key_desc')}</p>
            <div className={styles.keyBox}>
              <code>{newKeyDevice.key}</code>
              <Button variant="secondary" size="sm" onClick={() => void copy(newKeyDevice.key)}>
                <IconCopy size={15} />
                {t('devices.copy')}
              </Button>
            </div>
            <p className={styles.snippetLabel}>{t('devices.claude_code_setup')}</p>
            <pre className={styles.snippet}>
              {`export ANTHROPIC_BASE_URL=${baseUrl}\nexport ANTHROPIC_AUTH_TOKEN=${newKeyDevice.key}`}
            </pre>
          </div>
        ) : null}
      </Modal>

      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} ${tone === 'warn' ? styles.statWarn : ''}`}>
        {value}
      </span>
    </div>
  );
}

function DeviceDetails({ device }: { device: Device }) {
  const { t } = useTranslation();
  const maxDay = Math.max(0.0001, ...device.usage.byDay.map((d) => d.costUsd));
  return (
    <div className={styles.details}>
      <div>
        <h3 className={styles.detailsTitle}>{t('devices.daily_spend')}</h3>
        {device.usage.byDay.length === 0 ? (
          <p className={styles.muted}>{t('devices.no_usage')}</p>
        ) : (
          <div className={styles.chart}>
            {device.usage.byDay.map((d) => (
              <div
                key={d.day}
                className={styles.chartBar}
                style={{ height: `${Math.max(4, (d.costUsd / maxDay) * 100)}%` }}
                title={`${d.day}: ${formatUsd(d.costUsd)}`}
              />
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className={styles.detailsTitle}>{t('devices.by_model')}</h3>
        {device.usage.byModel.length === 0 ? (
          <p className={styles.muted}>{t('devices.no_usage')}</p>
        ) : (
          <table className={styles.table}>
            <tbody>
              {device.usage.byModel.map((m) => (
                <tr key={m.model}>
                  <td className={styles.mono}>{m.model}</td>
                  <td>{t('devices.requests_count', { count: m.requests })}</td>
                  <td className={styles.right}>{formatUsd(m.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const priceFields = ['input', 'output', 'cacheWrite', 'cacheRead'] as const;

function PricingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [rules, setRules] = useState<DevicePriceRule[]>([]);
  const [defaults, setDefaults] = useState<DevicePriceRule[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    devicesApi
      .getPricing()
      .then((pricing) => {
        setRules(pricing.rules);
        setDefaults(pricing.defaults);
      })
      .catch((error) => showNotification(getErrorMessage(error), 'error'));
  }, [open, showNotification]);

  const update = (index: number, patch: Partial<DevicePriceRule>) =>
    setRules((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const save = async (next: DevicePriceRule[]) => {
    setSaving(true);
    try {
      const pricing = await devicesApi.savePricing(next);
      setRules(pricing.rules);
      showNotification(t('devices.pricing_saved'), 'success');
      onClose();
    } catch (error) {
      showNotification(getErrorMessage(error, t('devices.save_failed')), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('devices.pricing_title')}
      onClose={onClose}
      width={760}
      closeDisabled={saving}
      footer={
        <>
          <Button variant="ghost" onClick={() => setRules(defaults)} disabled={saving}>
            {t('devices.pricing_reset')}
          </Button>
          <Button onClick={() => void save(rules)} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <p className={styles.description}>{t('devices.pricing_desc')}</p>
      <table className={`${styles.table} ${styles.priceTable}`}>
        <thead>
          <tr>
            <th>{t('devices.price_match')}</th>
            <th>{t('devices.price_input')}</th>
            <th>{t('devices.price_output')}</th>
            <th>{t('devices.price_cache_write')}</th>
            <th>{t('devices.price_cache_read')}</th>
            <th aria-label={t('devices.delete')} />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => (
            <tr key={index}>
              <td>
                <input
                  className={styles.cellInput}
                  value={rule.match}
                  aria-label={t('devices.price_match')}
                  onChange={(e) => update(index, { match: e.target.value })}
                />
              </td>
              {priceFields.map((field) => (
                <td key={field}>
                  <input
                    className={styles.cellInput}
                    type="number"
                    min={0}
                    step="0.01"
                    value={rule[field]}
                    aria-label={field}
                    onChange={(e) => update(index, { [field]: Number(e.target.value) || 0 })}
                  />
                </td>
              ))}
              <td>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.danger}`}
                  aria-label={t('devices.delete')}
                  onClick={() => setRules((list) => list.filter((_, i) => i !== index))}
                >
                  <IconTrash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          setRules((list) => [
            ...list,
            { match: '', input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
          ])
        }
      >
        <IconPlus size={15} />
        {t('devices.price_add')}
      </Button>
    </Modal>
  );
}
