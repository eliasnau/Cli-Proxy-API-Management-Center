import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { devicesApi, type DeviceMonthUsage } from '@/services/api';
import { getErrorMessage } from '@/utils/helpers';
import {
  formatCount,
  formatDayLabel,
  formatMonthLabel,
  formatPercent,
  formatSignedPercent,
  formatTokens,
  formatUsd,
} from './deviceFormat';
import { SpendChart } from './SpendChart';
import {
  cacheHitRate,
  costThroughDay,
  dailySeries,
  relativeChange,
  successRate,
  totalTokens,
  type MonthWindow,
} from './usageModel';
import styles from './DevicesPage.module.scss';

const TOKEN_PARTS = [
  { key: 'inputTokens', label: 'devices.tok_input', color: 'var(--series-2)' },
  { key: 'cacheReadTokens', label: 'devices.tok_cache_read', color: 'var(--series-3)' },
  { key: 'cacheWriteTokens', label: 'devices.tok_cache_write', color: 'var(--series-4)' },
  { key: 'outputTokens', label: 'devices.tok_output', color: 'var(--series-1)' },
] as const;

/** Stacked horizontal bar of the four token buckets, with numbers and shares. */
export function TokenMix({ usage }: { usage: DeviceMonthUsage }) {
  const { t } = useTranslation();
  const total = totalTokens(usage);
  const hit = cacheHitRate(usage);
  return (
    <div className={styles.tokenMix}>
      <div className={styles.tokenMixHead}>
        <span className={styles.tokenTotal}>{formatTokens(total)}</span>
        <span className={styles.mutedSmall}>{t('devices.tokens_total')}</span>
        <span className={styles.tokenHit}>
          {t('devices.cache_hit_inline', { value: formatPercent(hit) })}
        </span>
      </div>
      <div className={styles.stackBar} role="img" aria-label={t('devices.token_mix')}>
        {total > 0 ? (
          TOKEN_PARTS.map((part) =>
            usage[part.key] > 0 ? (
              <span
                key={part.key}
                style={{ flexGrow: usage[part.key], background: part.color }}
                title={`${t(part.label)}: ${formatCount(usage[part.key])}`}
              />
            ) : null
          )
        ) : (
          <span className={styles.stackEmpty} />
        )}
      </div>
      <dl className={styles.tokenLegend}>
        {TOKEN_PARTS.map((part) => (
          <div key={part.key}>
            <dt>
              <span className={styles.swatch} style={{ background: part.color }} />
              {t(part.label)}
            </dt>
            <dd>
              <strong>{formatTokens(usage[part.key])}</strong>
              <span>{formatPercent(total > 0 ? usage[part.key] / total : null)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Per-model table with cost share bars. */
export function ModelTable({ usage, dense = false }: { usage: DeviceMonthUsage; dense?: boolean }) {
  const { t } = useTranslation();
  if (usage.byModel.length === 0) {
    return <p className={styles.emptyNote}>{t('devices.no_usage')}</p>;
  }
  const maxCost = Math.max(...usage.byModel.map((m) => m.costUsd), 0);
  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>{t('devices.col_model')}</th>
            <th className={styles.shareCol}>{t('devices.col_share')}</th>
            <th className={styles.num}>{t('devices.col_cost')}</th>
            <th className={styles.num}>{t('devices.col_requests')}</th>
            {!dense ? <th className={styles.num}>{t('devices.col_success')}</th> : null}
            <th className={styles.num}>{t('devices.col_tokens_in')}</th>
            <th className={styles.num}>{t('devices.col_tokens_out')}</th>
            {!dense ? <th className={styles.num}>{t('devices.col_cache_hit')}</th> : null}
            <th className={styles.num}>{t('devices.col_cost_per_req')}</th>
          </tr>
        </thead>
        <tbody>
          {usage.byModel.map((m) => {
            const share = usage.costUsd > 0 ? m.costUsd / usage.costUsd : 0;
            const uncached = Math.max(0, m.inputTokens - m.cacheReadTokens - m.cacheWriteTokens);
            return (
              <tr key={m.model}>
                <td className={styles.modelName}>{m.model}</td>
                <td className={styles.shareCol}>
                  <div className={styles.shareCell}>
                    <span className={styles.shareTrack}>
                      <span
                        className={styles.shareFill}
                        style={{ width: `${maxCost > 0 ? (m.costUsd / maxCost) * 100 : 0}%` }}
                      />
                    </span>
                    <span className={styles.sharePct}>{formatPercent(share)}</span>
                  </div>
                </td>
                <td className={`${styles.num} ${styles.strong}`}>{formatUsd(m.costUsd)}</td>
                <td className={styles.num}>{formatCount(m.requests)}</td>
                {!dense ? <td className={styles.num}>{formatPercent(successRate(m))}</td> : null}
                <td className={styles.num}>{formatTokens(m.inputTokens)}</td>
                <td className={styles.num}>{formatTokens(m.outputTokens)}</td>
                {!dense ? (
                  <td className={styles.num}>
                    {formatPercent(
                      m.cacheReadTokens > 0
                        ? cacheHitRate({
                            inputTokens: uncached,
                            cacheReadTokens: m.cacheReadTokens,
                          })
                        : null
                    )}
                  </td>
                ) : null}
                <td className={styles.num}>
                  {m.requests > 0 ? formatUsd(m.costUsd / m.requests) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface DrilldownProps {
  deviceId: string;
  deviceName: string;
  usage: DeviceMonthUsage;
  window: MonthWindow;
  color: string;
  limit: number;
  onReset: () => void;
  canReset: boolean;
}

export function DeviceDrilldown({
  deviceId,
  deviceName,
  usage,
  window,
  color,
  limit,
  onReset,
  canReset,
}: DrilldownProps) {
  const { t, i18n } = useTranslation();
  const [history, setHistory] = useState<{ month: string; usage: DeviceMonthUsage }[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showDaily, setShowDaily] = useState(false);

  useEffect(() => {
    let alive = true;
    devicesApi
      .history(deviceId)
      .then((list) => alive && setHistory(list))
      .catch((error) => alive && setHistoryError(getErrorMessage(error)));
    return () => {
      alive = false;
    };
  }, [deviceId, usage.costUsd]);

  const series = useMemo(
    () => [
      {
        key: deviceId,
        name: deviceName,
        slot: null,
        values: dailySeries(usage, window),
        total: usage.costUsd,
      },
    ],
    [deviceId, deviceName, usage, window]
  );
  const requests = useMemo(() => {
    const map = new Map(usage.byDay.map((d) => [d.day, d.requests]));
    return { [deviceId]: window.days.map((d) => map.get(d) ?? 0) };
  }, [deviceId, usage, window]);
  const dailyBudget = limit > 0 ? limit / window.days.length : 0;
  const activeDays = usage.byDay.filter((d) => d.costUsd > 0 || d.requests > 0);
  const peak = activeDays.reduce<(typeof activeDays)[number] | null>(
    (best, d) => (!best || d.costUsd > best.costUsd ? d : best),
    null
  );

  return (
    <div className={styles.drill} style={{ ['--series-other' as string]: color }}>
      <section className={styles.drillSection}>
        <h3 className={styles.drillTitle}>{t('devices.token_mix')}</h3>
        <TokenMix usage={usage} />
        <div className={styles.miniStats}>
          <MiniStat
            label={t('devices.kpi_success')}
            value={formatPercent(successRate(usage))}
            hint={t('devices.failed_count', { count: usage.failedRequests })}
          />
          <MiniStat
            label={t('devices.kpi_avg_cost')}
            value={usage.requests ? formatUsd(usage.costUsd / usage.requests) : '—'}
          />
          <MiniStat label={t('devices.active_days')} value={String(activeDays.length)} />
          <MiniStat
            label={t('devices.peak_day')}
            value={peak ? formatUsd(peak.costUsd) : '—'}
            hint={peak ? formatDayLabel(peak.day, i18n.language) : undefined}
          />
        </div>
      </section>

      <section className={styles.drillSection}>
        <div className={styles.drillTitleRow}>
          <h3 className={styles.drillTitle}>{t('devices.daily_spend')}</h3>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setShowDaily((v) => !v)}
            aria-expanded={showDaily}
          >
            {showDaily ? t('devices.view_chart') : t('devices.view_table')}
          </button>
        </div>
        {showDaily ? (
          <DailyTable usage={usage} />
        ) : (
          <SpendChart
            series={series}
            window={window}
            requests={requests}
            height={176}
            compact
            reference={
              dailyBudget > 0
                ? {
                    value: dailyBudget,
                    label: t('devices.daily_budget', { value: formatUsd(dailyBudget) }),
                  }
                : null
            }
            ariaLabel={t('devices.daily_spend')}
          />
        )}
      </section>

      <section className={`${styles.drillSection} ${styles.drillWide}`}>
        <h3 className={styles.drillTitle}>{t('devices.by_model')}</h3>
        <ModelTable usage={usage} />
      </section>

      <section className={`${styles.drillSection} ${styles.drillWide}`}>
        <h3 className={styles.drillTitle}>{t('devices.mom_title')}</h3>
        {historyError ? (
          <p className={styles.emptyNote}>{historyError}</p>
        ) : history === null ? (
          <div className={styles.skeletonLine} />
        ) : history.length === 0 ? (
          <p className={styles.emptyNote}>{t('devices.no_history')}</p>
        ) : (
          <MonthComparison
            history={history.slice(0, 6)}
            locale={i18n.language}
            currentMonth={window.isCurrent ? window.month : ''}
            dayOfMonth={window.todayIndex + 1}
          />
        )}
      </section>

      {canReset ? (
        <div className={styles.drillFooter}>
          <button
            type="button"
            className={`${styles.linkButton} ${styles.linkDanger}`}
            onClick={onReset}
          >
            {t('devices.reset')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={styles.miniStat}>
      <span className={styles.miniLabel}>{label}</span>
      <span className={styles.miniValue}>{value}</span>
      {hint ? <span className={styles.miniHint}>{hint}</span> : null}
    </div>
  );
}

function DailyTable({ usage }: { usage: DeviceMonthUsage }) {
  const { t, i18n } = useTranslation();
  const rows = [...usage.byDay].reverse();
  if (rows.length === 0) return <p className={styles.emptyNote}>{t('devices.no_usage')}</p>;
  return (
    <div className={`${styles.tableScroll} ${styles.dailyScroll}`}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>{t('devices.col_day')}</th>
            <th className={styles.num}>{t('devices.col_requests')}</th>
            <th className={styles.num}>{t('devices.col_failed')}</th>
            <th className={styles.num}>{t('devices.col_tokens_in')}</th>
            <th className={styles.num}>{t('devices.col_tokens_out')}</th>
            <th className={styles.num}>{t('devices.col_cost')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.day}>
              <td>{formatDayLabel(d.day, i18n.language)}</td>
              <td className={styles.num}>{d.detailed ? formatCount(d.requests) : '—'}</td>
              <td className={styles.num}>{d.detailed ? formatCount(d.failedRequests) : '—'}</td>
              <td className={styles.num}>
                {d.detailed
                  ? formatTokens(d.inputTokens + d.cacheReadTokens + d.cacheWriteTokens)
                  : '—'}
              </td>
              <td className={styles.num}>{d.detailed ? formatTokens(d.outputTokens) : '—'}</td>
              <td className={`${styles.num} ${styles.strong}`}>{formatUsd(d.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthComparison({
  history,
  locale,
  currentMonth,
  dayOfMonth,
}: {
  history: { month: string; usage: DeviceMonthUsage }[];
  locale: string;
  currentMonth: string;
  dayOfMonth: number;
}) {
  const { t } = useTranslation();
  const max = Math.max(...history.map((h) => h.usage.costUsd), 0);
  return (
    <div className={styles.momList}>
      {history.map((entry, index) => {
        const prev = history[index + 1];
        // A partial month is compared with the same days of the month before.
        const partial = entry.month === currentMonth;
        const baseline = prev
          ? partial
            ? costThroughDay(prev.usage, dayOfMonth)
            : prev.usage.costUsd
          : 0;
        const change = prev ? relativeChange(entry.usage.costUsd, baseline) : null;
        return (
          <div key={entry.month} className={styles.momRow}>
            <span className={styles.momMonth}>
              {formatMonthLabel(entry.month, locale)}
              {entry.month === currentMonth ? (
                <span className={styles.mtdTag}>{t('devices.mtd')}</span>
              ) : null}
            </span>
            <span className={styles.momTrack}>
              <span
                className={styles.momFill}
                style={{ width: `${max > 0 ? (entry.usage.costUsd / max) * 100 : 0}%` }}
              />
            </span>
            <span className={`${styles.num} ${styles.strong}`}>
              {formatUsd(entry.usage.costUsd)}
            </span>
            <span className={styles.num}>
              {t('devices.requests_count', { count: entry.usage.requests })}
            </span>
            <span className={styles.num}>{formatTokens(totalTokens(entry.usage))}</span>
            <span
              className={`${styles.delta} ${
                change === null ? '' : change > 0 ? styles.deltaUp : styles.deltaDown
              }`}
            >
              {change === null ? '—' : formatSignedPercent(change)}
              {change !== null && partial ? (
                <span className={styles.deltaNote}>{t('devices.same_days')}</span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
