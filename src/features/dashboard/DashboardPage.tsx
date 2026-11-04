import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { formatCompactNumber, formatPercent } from '@/utils/format';
import { useDashboardOverview } from './hooks/useDashboardOverview';
import { ThroughputChart } from './components/ThroughputChart';
import { providerLabel, splitWindowMinutes } from './utils';
import styles from './dashboard.module.scss';

const DASH = '—';

/** 大数字：六位以内用千分位，再往上压缩，避免撑破排版 */
const formatHeadline = (value: number): string =>
  value < 100_000 ? value.toLocaleString() : formatCompactNumber(value);

export function DashboardPage() {
  const { t } = useTranslation();
  const serverVersion = useAuthStore((state) => state.serverVersion);

  const { connectionStatus, connected, counts, traffic, providers, credentials, refresh } =
    useDashboardOverview();

  useHeaderRefresh(refresh, connected);

  const windowLabel = useMemo(() => {
    if (traffic.windowMinutes <= 0) return DASH;
    const { hours, minutes } = splitWindowMinutes(traffic.windowMinutes);
    if (hours === 0) return t('dashboard.window_m', { minutes });
    if (minutes === 0) return t('dashboard.window_h', { hours });
    return t('dashboard.window_hm', { hours, minutes });
  }, [traffic.windowMinutes, t]);

  const unknownProviderLabel = t('dashboard.provider_unknown');

  const connectionLabel = t(
    connectionStatus === 'connected'
      ? 'common.connected'
      : connectionStatus === 'connecting'
        ? 'common.connecting'
        : 'common.disconnected'
  );
  const versionLabel = serverVersion ? `v${serverVersion.trim().replace(/^[vV]+/, '')}` : null;

  const statTiles = [
    {
      key: 'requests',
      label: t('dashboard.hero_requests_label'),
      value: connected ? formatHeadline(traffic.total) : DASH,
      hint: windowLabel === DASH ? '' : t('dashboard.hero_window_meta', { window: windowLabel }),
    },
    {
      key: 'success',
      label: t('dashboard.success_rate'),
      value: traffic.successRate === null ? DASH : formatPercent(traffic.successRate),
      hint: t('dashboard.stat_success_hint', { total: traffic.total.toLocaleString() }),
    },
    {
      key: 'credentials',
      label: t('dashboard.stat_credentials'),
      value: credentials ? credentials.total.toLocaleString() : DASH,
      hint: credentials
        ? t('dashboard.stat_credentials_hint', {
            active: credentials.active,
            disabled: credentials.disabled + credentials.unavailable,
          })
        : t('dashboard.stat_credentials_empty'),
    },
    {
      key: 'models',
      label: t('dashboard.stat_models'),
      value: counts.models === null ? DASH : counts.models.toLocaleString(),
      hint: t('dashboard.stat_models_hint'),
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('nav.dashboard')}</h1>
        <span className={styles.status}>
          <i
            className={`${styles.statusDot} ${styles[`status_${connectionStatus}`] ?? ''}`}
            aria-hidden="true"
          />
          {[versionLabel, connectionLabel].filter(Boolean).join(' · ')}
        </span>
      </header>

      <section className={styles.stats} aria-label={t('dashboard.stats_aria')}>
        {statTiles.map((tile) => (
          <article key={tile.key} className={styles.stat}>
            <span className={styles.statLabel}>{tile.label}</span>
            <strong className={styles.statValue}>{tile.value}</strong>
            <span className={styles.statHint}>{tile.hint}</span>
          </article>
        ))}
      </section>

      <section className={styles.card} aria-labelledby="dashboard-traffic-title">
        <header className={styles.cardHead}>
          <h2 id="dashboard-traffic-title" className={styles.cardTitle}>
            {t('dashboard.traffic_title')}
          </h2>
          {windowLabel !== DASH && (
            <span className={styles.cardMeta}>
              {t('dashboard.traffic_description', { window: windowLabel })}
            </span>
          )}
        </header>
        <div className={styles.cardBody}>
          <ThroughputChart traffic={traffic} />
        </div>
      </section>

      <section className={styles.card} aria-labelledby="dashboard-providers-title">
        <header className={styles.cardHead}>
          <h2 id="dashboard-providers-title" className={styles.cardTitle}>
            {t('dashboard.fleet_title')}
          </h2>
        </header>
        {providers.length === 0 ? (
          <p className={styles.empty}>{t('dashboard.fleet_empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('dashboard.fleet_eyebrow')}</th>
                  <th scope="col" className={styles.num}>
                    {t('dashboard.stat_credentials')}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t('dashboard.fleet_requests')}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t('dashboard.success_rate')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.id}>
                    <th scope="row">{providerLabel(provider.id, unknownProviderLabel)}</th>
                    <td className={styles.num}>{provider.credentials.toLocaleString()}</td>
                    <td className={styles.num}>{provider.total.toLocaleString()}</td>
                    <td className={styles.num}>
                      {provider.successRate === null ? DASH : formatPercent(provider.successRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
