import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconChevronDown,
  IconCopy,
  IconDollarSign,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconPlus,
  IconRefreshCw,
  IconTrash2,
} from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import {
  devicesApi,
  type Device,
  type DeviceAccount,
  type DeviceMonthUsage,
  type DeviceUsageReport,
} from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import { getErrorMessage } from '@/utils/helpers';
import {
  formatCount,
  formatMonthLabel,
  formatPercent,
  formatSignedPercent,
  formatTokens,
  formatUsd,
  maskKey,
} from './deviceFormat';
import { AccessEditor, type AccessDraft } from './AccessEditor';
import { accessDetail, accessSummary, parseModelPatterns } from './deviceAccess';
import { PricingModal } from './PricingModal';
import { seriesColor } from './chartUtils';
import { SpendChart, Sparkline } from './SpendChart';
import { DeviceDrilldown, ModelTable, TokenMix } from './UsagePanels';
import {
  SERIES_SLOTS,
  cacheHitRate,
  costThroughDay,
  dailySeries,
  emptyUsage,
  monthWindow,
  previousMonth,
  projectMonthEnd,
  relativeChange,
  stackSeries,
  successRate,
  sumUsage,
  totalTokens,
  type MonthWindow,
} from './usageModel';
import styles from './DevicesPage.module.scss';

interface DeviceDraft extends AccessDraft {
  id: string | null;
  name: string;
  limit: string;
  note: string;
}

type DeviceRowStatus = 'active' | 'disabled' | 'limited' | 'at_risk';

const emptyDraft: DeviceDraft = {
  id: null,
  name: '',
  limit: '',
  note: '',
  allowedProviders: [],
  allowedAuths: [],
  models: '',
};

interface Entry {
  device: Device;
  usage: DeviceMonthUsage;
  slot: number | null;
}

export function DevicesPage({ view = 'usage' }: { view?: 'usage' | 'devices' }) {
  const isUsage = view === 'usage';
  const { t, i18n } = useTranslation();
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const apiBase = useAuthStore((state) => state.apiBase);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);

  const [devices, setDevices] = useState<Device[]>([]);
  const [report, setReport] = useState<DeviceUsageReport | null>(null);
  const [prevReport, setPrevReport] = useState<DeviceUsageReport | null>(null);
  const [month, setMonth] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DeviceDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [newKeyDevice, setNewKeyDevice] = useState<Device | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [chartView, setChartView] = useState<'chart' | 'table'>('chart');
  const [accounts, setAccounts] = useState<DeviceAccount[] | null>(null);
  const [accountProviders, setAccountProviders] = useState<string[]>([]);
  const [accountsFailed, setAccountsFailed] = useState(false);
  const requestSeq = useRef(0);
  const accountsSeq = useRef(0);

  // Accounts feed the access editor and the access tooltips; failures only affect those.
  const loadAccounts = useCallback(async () => {
    const seq = ++accountsSeq.current;
    setAccountsFailed(false);
    try {
      const result = await devicesApi.accounts();
      if (seq !== accountsSeq.current) return;
      setAccounts(result.accounts);
      setAccountProviders(result.providers);
    } catch {
      if (seq === accountsSeq.current) setAccountsFailed(true);
    }
  }, []);

  useEffect(() => {
    if (connected) void loadAccounts();
  }, [connected, loadAccounts]);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const [list, usage] = await Promise.all([
        devicesApi.list(),
        devicesApi.usage(month || undefined),
      ]);
      if (seq !== requestSeq.current) return;
      setDevices(list);
      setReport(usage);
      const prev = previousMonth(usage.month);
      const prevUsage = usage.months.includes(prev) ? await devicesApi.usage(prev) : null;
      if (seq !== requestSeq.current) return;
      setPrevReport(prevUsage);
    } catch (error) {
      if (seq === requestSeq.current) {
        showNotification(getErrorMessage(error, t('devices.load_failed')), 'error');
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [month, showNotification, t]);

  useHeaderRefresh(load, connected);
  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  const activeMonth = report?.month ?? '';
  const window = useMemo<MonthWindow>(
    () => monthWindow(activeMonth || new Date().toISOString().slice(0, 7)),
    [activeMonth]
  );

  const entries = useMemo<Entry[]>(() => {
    const byId = new Map(report?.devices.map((d) => [d.id, d.usage]) ?? []);
    return devices.map((device, index) => ({
      device,
      usage: byId.get(device.id) ?? emptyUsage(),
      slot: index < SERIES_SLOTS ? index : null,
    }));
  }, [devices, report]);

  const total = useMemo(() => sumUsage(entries.map((e) => e.usage)), [entries]);
  const prevTotal = useMemo(
    () => (prevReport ? sumUsage(prevReport.devices.map((d) => d.usage)) : null),
    [prevReport]
  );

  const series = useMemo(
    () =>
      stackSeries(
        entries.map((e) => ({ id: e.device.id, name: e.device.name, usage: e.usage })),
        window,
        t('devices.other_devices')
      ),
    [entries, window, t]
  );
  const seriesRequests = useMemo(() => {
    const out: Record<string, number[]> = {};
    entries.forEach((e) => {
      const map = new Map(e.usage.byDay.map((d) => [d.day, d.requests]));
      out[e.device.id] = window.days.map((d) => map.get(d) ?? 0);
    });
    return out;
  }, [entries, window]);

  const kpis = useMemo(() => {
    // Compare against the same point of the previous month for the current month.
    const dayOfMonth = window.isCurrent ? window.todayIndex + 1 : window.days.length;
    const prevSpend = prevTotal
      ? window.isCurrent
        ? costThroughDay(prevTotal, dayOfMonth)
        : prevTotal.costUsd
      : null;
    const limits = entries.reduce((sum, e) => sum + (e.device.monthlyLimitUsd || 0), 0);
    const unlimited = entries.some((e) => !e.device.monthlyLimitUsd);
    return {
      spend: total.costUsd,
      spendChange: prevSpend !== null ? relativeChange(total.costUsd, prevSpend) : null,
      projected: projectMonthEnd(total.costUsd, window),
      prevFull: prevTotal?.costUsd ?? null,
      limits: unlimited ? null : limits,
      requests: total.requests,
      requestsChange:
        prevTotal && !window.isCurrent ? relativeChange(total.requests, prevTotal.requests) : null,
      success: successRate(total),
      tokens: totalTokens(total),
      cacheHit: cacheHitRate(total),
      avgCost: total.requests > 0 ? total.costUsd / total.requests : null,
    };
  }, [entries, prevTotal, total, window]);

  const monthOptions = useMemo(
    () =>
      (report?.months ?? []).map((m) => ({
        value: m,
        label:
          m === report?.currentMonth
            ? t('devices.month_current', { month: formatMonthLabel(m, i18n.language) })
            : formatMonthLabel(m, i18n.language),
      })),
    [report, t, i18n.language]
  );

  const replaceDevice = (next: Device) =>
    setDevices((list) =>
      list.map((d) => (d.id === next.id ? { ...d, ...next, usage: d.usage } : d))
    );

  const copy = async (text: string) => {
    const ok = await copyToClipboard(text);
    showNotification(ok ? t('devices.copied') : t('devices.copy_failed'), ok ? 'success' : 'error');
  };

  const openDraft = (next: DeviceDraft) => {
    setDraft(next);
    if (accounts === null || accountsFailed) void loadAccounts();
  };

  const saveDraft = async () => {
    if (!draft) return;
    const access = {
      allowedProviders: draft.allowedProviders,
      allowedAuths: draft.allowedAuths,
      allowedModels: parseModelPatterns(draft.models),
    };
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
          await devicesApi.update(draft.id, {
            name,
            monthlyLimitUsd: limit,
            note: draft.note,
            ...access,
          })
        );
      } else {
        const created = await devicesApi.create({
          name,
          monthlyLimitUsd: limit,
          note: draft.note,
          ...access,
        });
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

  const baseUrl = (apiBase || globalThis.location.origin).replace(/\/+$/, '');
  const firstLoad = loading && report === null;
  const hasSpend = total.costUsd > 0 || total.requests > 0;
  const monthLabel = formatMonthLabel(window.month, i18n.language);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>
            {isUsage ? t('devices.title') : t('devices.page_devices_title')}
          </h1>
          <p className={styles.description}>
            {isUsage ? t('devices.page_usage_desc') : t('devices.page_devices_desc')}
          </p>
        </div>
        <div className={styles.headerActions}>
          {monthOptions.length > 0 ? (
            <Select
              value={activeMonth}
              options={monthOptions}
              onChange={(value) => {
                setMonth(value === report?.currentMonth ? '' : value);
                setExpanded(null);
              }}
              ariaLabel={t('devices.month_select')}
              size="sm"
              fullWidth={false}
              className={styles.monthSelect}
            />
          ) : null}
          {isUsage ? (
            <Button variant="secondary" size="sm" onClick={() => setPricingOpen(true)}>
              {t('devices.pricing')}
            </Button>
          ) : (
            <Button size="sm" onClick={() => openDraft(emptyDraft)} disabled={!connected}>
              <IconPlus size={16} />
              {t('devices.add')}
            </Button>
          )}
        </div>
      </header>

      {isUsage ? (
        <>
          <section className={styles.kpis} aria-label={t('devices.kpis_aria')}>
            <Kpi
              primary
              label={window.isCurrent ? t('devices.kpi_spend_mtd') : t('devices.kpi_spend')}
              value={formatUsd(kpis.spend)}
              loading={firstLoad}
              delta={kpis.spendChange}
              deltaHint={window.isCurrent ? t('devices.vs_same_point') : t('devices.vs_prev_month')}
            />
            <Kpi
              label={window.isCurrent ? t('devices.kpi_projected') : t('devices.kpi_final')}
              value={formatUsd(kpis.projected)}
              loading={firstLoad}
              hint={
                kpis.limits !== null && kpis.limits > 0
                  ? t('devices.of_total_limits', {
                      pct: formatPercent(kpis.projected / kpis.limits, 0),
                      limit: formatUsd(kpis.limits),
                    })
                  : kpis.prevFull !== null
                    ? t('devices.prev_month_total', { value: formatUsd(kpis.prevFull) })
                    : t('devices.run_rate_hint')
              }
            />
            <Kpi
              label={t('devices.kpi_requests')}
              value={formatCount(kpis.requests)}
              loading={firstLoad}
              delta={kpis.requestsChange}
              deltaHint={t('devices.vs_prev_month')}
              hint={
                kpis.requestsChange === null
                  ? t('devices.per_day', {
                      value: formatCount(
                        Math.round(kpis.requests / Math.max(1, window.elapsedDays))
                      ),
                    })
                  : undefined
              }
            />
            <Kpi
              label={t('devices.kpi_success')}
              value={formatPercent(kpis.success)}
              loading={firstLoad}
              hint={t('devices.failed_count', { count: total.failedRequests })}
            />
            <Kpi
              label={t('devices.kpi_tokens')}
              value={formatTokens(kpis.tokens)}
              loading={firstLoad}
              hint={t('devices.tokens_split', {
                input: formatTokens(
                  total.inputTokens + total.cacheReadTokens + total.cacheWriteTokens
                ),
                output: formatTokens(total.outputTokens),
              })}
            />
            <Kpi
              label={t('devices.kpi_cache_hit')}
              value={formatPercent(kpis.cacheHit)}
              loading={firstLoad}
              hint={t('devices.cache_read_hint', { value: formatTokens(total.cacheReadTokens) })}
            />
            <Kpi
              label={t('devices.kpi_avg_cost')}
              value={kpis.avgCost === null ? '—' : formatUsd(kpis.avgCost)}
              loading={firstLoad}
              hint={
                kpis.tokens > 0
                  ? t('devices.per_million', {
                      value: formatUsd((total.costUsd / kpis.tokens) * 1e6),
                    })
                  : undefined
              }
            />
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>{t('devices.chart_title')}</h2>
                <p className={styles.panelSub}>{t('devices.chart_sub', { month: monthLabel })}</p>
              </div>
              <div className={styles.segmented} role="group" aria-label={t('devices.view_mode')}>
                {(['chart', 'table'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={chartView === mode}
                    className={chartView === mode ? styles.segActive : undefined}
                    onClick={() => setChartView(mode)}
                  >
                    {t(`devices.view_${mode}`)}
                  </button>
                ))}
              </div>
            </div>
            {series.length > 0 ? (
              <ul className={styles.legend}>
                {series.map((s) => (
                  <li key={s.key}>
                    <span className={styles.swatch} style={{ background: seriesColor(s.slot) }} />
                    <span className={styles.legendName}>{s.name}</span>
                    <span className={styles.legendValue}>{formatUsd(s.total)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {firstLoad ? (
              <div className={styles.chartSkeleton} />
            ) : chartView === 'chart' ? (
              <div className={styles.chartArea}>
                <SpendChart
                  series={series}
                  window={window}
                  requests={seriesRequests}
                  ariaLabel={t('devices.chart_aria', {
                    month: monthLabel,
                    total: formatUsd(total.costUsd),
                  })}
                />
                {!hasSpend ? (
                  <div className={styles.chartEmpty}>
                    <strong>{t('devices.chart_empty_title')}</strong>
                    <span>
                      {devices.length === 0
                        ? t('devices.chart_empty_no_devices')
                        : t('devices.chart_empty_desc')}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <DailyMatrix series={series} window={window} />
            )}
          </section>

          <div className={styles.split}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <h2 className={styles.panelTitle}>{t('devices.token_mix')}</h2>
                  <p className={styles.panelSub}>{t('devices.token_mix_sub')}</p>
                </div>
              </div>
              <TokenMix usage={total} />
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <h2 className={styles.panelTitle}>{t('devices.share_title')}</h2>
                  <p className={styles.panelSub}>
                    {t('devices.share_sub', { total: formatUsd(total.costUsd) })}
                  </p>
                </div>
              </div>
              <ShareList entries={entries} total={total.costUsd} />
            </section>
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>{t('devices.models_title')}</h2>
                <p className={styles.panelSub}>
                  {t('devices.models_sub', { count: total.byModel.length })}
                </p>
              </div>
            </div>
            <ModelTable usage={total} />
          </section>
        </>
      ) : null}

      {!isUsage ? (
        <section className={styles.devicesSection}>
          <div className={styles.sectionHead}>
            <h2 className={styles.panelTitle}>{t('devices.devices_title')}</h2>
            <span className={styles.countPill}>{devices.length}</span>
          </div>

          {firstLoad ? (
            <div className={styles.list}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={styles.skeleton} />
              ))}
            </div>
          ) : devices.length === 0 ? (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIcon} aria-hidden="true">
                <IconDollarSign size={20} />
              </div>
              <strong>{t('devices.empty_title')}</strong>
              <p>{t('devices.empty_desc')}</p>
              <Button size="sm" onClick={() => openDraft(emptyDraft)}>
                <IconPlus size={16} />
                {t('devices.add')}
              </Button>
            </div>
          ) : (
            <div className={styles.list}>
              {entries.map((entry) => (
                <DeviceRow
                  key={entry.device.id}
                  entry={entry}
                  window={window}
                  accounts={accounts ?? []}
                  revealed={Boolean(revealed[entry.device.id])}
                  expanded={expanded === entry.device.id}
                  onToggleExpand={() =>
                    setExpanded((cur) => (cur === entry.device.id ? null : entry.device.id))
                  }
                  onToggleReveal={() =>
                    setRevealed((r) => ({ ...r, [entry.device.id]: !r[entry.device.id] }))
                  }
                  onCopy={() => void copy(entry.device.key)}
                  onToggleEnabled={(value) => void toggleDisabled(entry.device, value)}
                  onEdit={() =>
                    openDraft({
                      id: entry.device.id,
                      name: entry.device.name,
                      limit: entry.device.monthlyLimitUsd
                        ? String(entry.device.monthlyLimitUsd)
                        : '',
                      note: entry.device.note,
                      allowedProviders: entry.device.allowedProviders,
                      allowedAuths: entry.device.allowedAuths,
                      models: entry.device.allowedModels.join(', '),
                    })
                  }
                  onRotate={() => rotate(entry.device)}
                  onDelete={() => remove(entry.device)}
                  onReset={() => reset(entry.device)}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

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
            <AccessEditor
              value={draft}
              onChange={(access) => setDraft({ ...draft, ...access })}
              accounts={accounts}
              providers={accountProviders}
              loadFailed={accountsFailed}
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

function Kpi({
  label,
  value,
  hint,
  delta,
  deltaHint,
  loading,
  primary,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  deltaHint?: string;
  loading?: boolean;
  primary?: boolean;
}) {
  return (
    <div className={`${styles.kpi} ${primary ? styles.kpiPrimary : ''}`}>
      <span className={styles.kpiLabel}>{label}</span>
      {loading ? (
        <span className={styles.kpiSkeleton} />
      ) : (
        <span className={styles.kpiValue}>{value}</span>
      )}
      {delta !== undefined && delta !== null ? (
        <span className={styles.kpiHint}>
          <span className={`${styles.delta} ${delta > 0 ? styles.deltaUp : styles.deltaDown}`}>
            {formatSignedPercent(delta)}
          </span>{' '}
          {deltaHint}
        </span>
      ) : hint ? (
        <span className={styles.kpiHint}>{hint}</span>
      ) : null}
    </div>
  );
}

function ShareList({ entries, total }: { entries: Entry[]; total: number }) {
  if (entries.length === 0) return null;
  const ranked = [...entries].sort((a, b) => b.usage.costUsd - a.usage.costUsd);
  return (
    <div className={styles.shareList}>
      {ranked.map((e) => {
        const share = total > 0 ? e.usage.costUsd / total : 0;
        return (
          <div key={e.device.id} className={styles.shareRow}>
            <span className={styles.swatch} style={{ background: seriesColor(e.slot) }} />
            <span className={styles.shareName}>{e.device.name}</span>
            <span className={styles.shareTrack}>
              <span
                className={styles.shareFill}
                style={{ width: `${share * 100}%`, background: seriesColor(e.slot) }}
              />
            </span>
            <span className={styles.shareValue}>{formatUsd(e.usage.costUsd)}</span>
            <span className={styles.sharePct}>{formatPercent(total > 0 ? share : null, 0)}</span>
          </div>
        );
      })}
    </div>
  );
}

function DailyMatrix({
  series,
  window,
}: {
  series: ReturnType<typeof stackSeries>;
  window: MonthWindow;
}) {
  const { t } = useTranslation();
  const lastIndex = window.isCurrent ? window.todayIndex : window.days.length - 1;
  const rows = window.days
    .map((day, i) => ({ day, i }))
    .filter(({ i }) => i <= lastIndex)
    .reverse();
  if (rows.length === 0) return <p className={styles.emptyNote}>{t('devices.no_usage')}</p>;
  return (
    <div className={`${styles.tableScroll} ${styles.matrixScroll}`}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>{t('devices.col_day')}</th>
            {series.map((s) => (
              <th key={s.key} className={styles.num}>
                <span className={styles.swatch} style={{ background: seriesColor(s.slot) }} />
                {s.name}
              </th>
            ))}
            <th className={styles.num}>{t('devices.col_total')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ day, i }) => {
            const rowTotal = series.reduce((sum, s) => sum + s.values[i], 0);
            return (
              <tr key={day}>
                <td className={styles.mono}>{day}</td>
                {series.map((s) => (
                  <td key={s.key} className={`${styles.num} ${s.values[i] ? '' : styles.dim}`}>
                    {s.values[i] ? formatUsd(s.values[i]) : '—'}
                  </td>
                ))}
                <td className={`${styles.num} ${styles.strong}`}>{formatUsd(rowTotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface DeviceRowProps {
  entry: Entry;
  window: MonthWindow;
  accounts: DeviceAccount[];
  revealed: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleReveal: () => void;
  onCopy: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onRotate: () => void;
  onDelete: () => void;
  onReset: () => void;
}

function DeviceRow({
  entry,
  window,
  accounts,
  revealed,
  expanded,
  onToggleExpand,
  onToggleReveal,
  onCopy,
  onToggleEnabled,
  onEdit,
  onRotate,
  onDelete,
  onReset,
}: DeviceRowProps) {
  const { t } = useTranslation();
  const { device, usage, slot } = entry;
  const color = seriesColor(slot);
  const limit = device.monthlyLimitUsd;
  const projected = projectMonthEnd(usage.costUsd, window);
  const status: DeviceRowStatus = device.disabled
    ? 'disabled'
    : limit > 0 && usage.costUsd >= limit
      ? 'limited'
      : window.isCurrent && limit > 0 && projected > limit
        ? 'at_risk'
        : 'active';
  const ratio = limit > 0 ? Math.min(1, usage.costUsd / limit) : 0;
  const projectedRatio = limit > 0 ? Math.min(1, projected / limit) : 0;
  const values = useMemo(() => dailySeries(usage, window), [usage, window]);
  const panelId = `device-drill-${device.id}`;
  const access = accessSummary(device, t);

  return (
    <article className={`${styles.row} ${expanded ? styles.rowOpen : ''}`}>
      <div className={styles.rowMain}>
        <div className={styles.identity}>
          <span className={styles.rowSwatch} style={{ background: color }} aria-hidden="true" />
          <div className={styles.identityText}>
            <div className={styles.nameRow}>
              <span className={styles.name}>{device.name}</span>
              <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
                <span className={styles.badgeDot} aria-hidden="true" />
                {t(`devices.status_${status}`)}
              </span>
              {access ? (
                <span
                  className={`${styles.badge} ${styles.badge_access}`}
                  title={accessDetail(device, accounts, t)}
                >
                  {access}
                </span>
              ) : null}
            </div>
            <div className={styles.keyRow}>
              <code className={styles.key}>{revealed ? device.key : maskKey(device.key)}</code>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={revealed ? t('devices.hide_key') : t('devices.show_key')}
                title={revealed ? t('devices.hide_key') : t('devices.show_key')}
                onClick={onToggleReveal}
              >
                {revealed ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t('devices.copy_key')}
                title={t('devices.copy_key')}
                onClick={onCopy}
              >
                <IconCopy size={14} />
              </button>
            </div>
            <p className={styles.note}>
              {device.note ? `${device.note} · ` : ''}
              {device.lastUsedAt
                ? t('devices.last_used', { when: new Date(device.lastUsedAt).toLocaleString() })
                : t('devices.never_used')}
            </p>
          </div>
        </div>

        <div className={styles.spend}>
          <div className={styles.spendRow}>
            <span className={styles.spendValue}>{formatUsd(usage.costUsd)}</span>
            <span className={styles.spendLimit}>
              {limit > 0
                ? t('devices.of_limit_short', { limit: formatUsd(limit) })
                : t('devices.no_limit')}
            </span>
            {window.isCurrent && usage.costUsd > 0 ? (
              <span className={styles.spendProjected}>
                {t('devices.projected_short', { value: formatUsd(projected) })}
              </span>
            ) : null}
          </div>
          <div
            className={styles.limitBar}
            role={limit > 0 ? 'meter' : undefined}
            aria-valuemin={limit > 0 ? 0 : undefined}
            aria-valuemax={limit > 0 ? limit : undefined}
            aria-valuenow={limit > 0 ? usage.costUsd : undefined}
            aria-label={t('devices.limit_meter')}
          >
            {limit > 0 ? (
              <>
                {window.isCurrent && projected > usage.costUsd ? (
                  <span
                    className={`${styles.limitProjected} ${
                      projected > limit ? styles.limitProjectedOver : ''
                    }`}
                    style={{ width: `${projectedRatio * 100}%` }}
                  />
                ) : null}
                <span
                  className={`${styles.limitFill} ${
                    ratio >= 1 ? styles.limitFull : ratio >= 0.8 ? styles.limitWarn : ''
                  }`}
                  style={{ width: `${ratio * 100}%`, background: ratio < 0.8 ? color : undefined }}
                />
                {window.isCurrent ? (
                  <span
                    className={`${styles.limitMarker} ${projected > limit ? styles.limitMarkerOver : ''}`}
                    style={{ left: `${projectedRatio * 100}%` }}
                    title={t('devices.projected_short', { value: formatUsd(projected) })}
                  />
                ) : null}
              </>
            ) : (
              <span className={styles.limitNone} />
            )}
          </div>
          <div className={styles.spendMeta}>
            {limit > 0 ? (
              <span>{t('devices.used_pct', { pct: formatPercent(usage.costUsd / limit, 0) })}</span>
            ) : null}
            {limit > 0 && window.isCurrent && projected > limit ? (
              <span className={styles.overText}>
                {t('devices.projected_over', { value: formatUsd(projected - limit) })}
              </span>
            ) : limit > 0 && usage.costUsd < limit ? (
              <span>{t('devices.remaining', { value: formatUsd(limit - usage.costUsd) })}</span>
            ) : null}
          </div>
        </div>

        <div className={styles.sparkCell}>
          <Sparkline
            values={values}
            todayIndex={window.isCurrent ? window.todayIndex : -1}
            color={color}
            label={t('devices.spark_aria', { name: device.name })}
          />
        </div>

        <dl className={styles.rowStats}>
          <div>
            <dt>{t('devices.col_requests')}</dt>
            <dd>{formatCount(usage.requests)}</dd>
          </div>
          <div>
            <dt>{t('devices.col_success')}</dt>
            <dd>{formatPercent(successRate(usage))}</dd>
          </div>
          <div>
            <dt>{t('devices.col_tokens')}</dt>
            <dd>{formatTokens(totalTokens(usage))}</dd>
          </div>
        </dl>

        <div className={styles.actions}>
          <ToggleSwitch
            checked={!device.disabled}
            onChange={onToggleEnabled}
            ariaLabel={t('devices.enabled')}
          />
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t('devices.edit')}
            title={t('devices.edit')}
            onClick={onEdit}
          >
            <IconPencil size={15} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t('devices.rotate')}
            title={t('devices.rotate')}
            onClick={onRotate}
          >
            <IconRefreshCw size={15} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.danger}`}
            aria-label={t('devices.delete')}
            title={t('devices.delete')}
            onClick={onDelete}
          >
            <IconTrash2 size={15} />
          </button>
          <button
            type="button"
            className={`${styles.expandButton} ${expanded ? styles.expandOpen : ''}`}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={expanded ? t('devices.hide_details') : t('devices.show_details')}
            title={expanded ? t('devices.hide_details') : t('devices.show_details')}
            onClick={onToggleExpand}
          >
            <IconChevronDown size={16} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div id={panelId}>
          <DeviceDrilldown
            deviceId={device.id}
            deviceName={device.name}
            usage={usage}
            window={window}
            color={color}
            limit={limit}
            canReset={window.isCurrent}
            onReset={onReset}
          />
        </div>
      ) : null}
    </article>
  );
}
