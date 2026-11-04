import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { accessSummary } from '@/features/devices/deviceAccess';
import { formatUsd } from '@/features/devices/deviceFormat';
import { devicesApi, type Device } from '@/services/api';
import styles from '../dashboard.module.scss';

/** One line per device: access restriction and this month's spend against its limit. */
export function DevicesCard({
  connected,
  reloadToken,
}: {
  connected: boolean;
  reloadToken: number;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const current = ++seq.current;
    setFailed(false);
    try {
      const list = await devicesApi.list();
      if (current === seq.current) setDevices(list);
    } catch {
      if (current === seq.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load, reloadToken]);

  return (
    <section className={styles.card} aria-labelledby={`${id}-title`}>
      <header className={styles.cardHead}>
        <h2 id={`${id}-title`} className={styles.cardTitle}>
          {t('dashboard.devices_title')}
        </h2>
        <Link to="/devices" className={styles.cardLink}>
          {t('dashboard.devices_open')}
        </Link>
      </header>
      {devices === null ? (
        <p className={styles.empty}>
          {failed ? t('dashboard.devices_load_failed') : t('common.loading')}
        </p>
      ) : devices.length === 0 ? (
        <p className={styles.empty}>{t('dashboard.devices_empty')}</p>
      ) : (
        <ul className={styles.deviceList}>
          {devices.map((device) => {
            const spent = device.usage.costUsd;
            const limit = device.monthlyLimitUsd;
            const ratio = limit > 0 ? Math.min(1, spent / limit) : 0;
            const access = accessSummary(device, t) ?? t('dashboard.devices_all_access');
            return (
              <li key={device.id} className={styles.deviceRow}>
                <div className={styles.deviceIdentity}>
                  <span className={styles.deviceName}>{device.name}</span>
                  <span className={styles.deviceAccess}>
                    {device.disabled ? `${t('dashboard.devices_disabled')} · ` : ''}
                    {access}
                  </span>
                </div>
                <div className={styles.deviceSpend}>
                  <span className={styles.deviceSpendText}>
                    {limit > 0
                      ? t('dashboard.devices_spend', {
                          spent: formatUsd(spent),
                          limit: formatUsd(limit),
                        })
                      : t('dashboard.devices_spend_unlimited', { spent: formatUsd(spent) })}
                  </span>
                  <span
                    className={styles.deviceBar}
                    role={limit > 0 ? 'meter' : undefined}
                    aria-valuemin={limit > 0 ? 0 : undefined}
                    aria-valuemax={limit > 0 ? limit : undefined}
                    aria-valuenow={limit > 0 ? spent : undefined}
                    aria-label={t('dashboard.devices_spend_aria', { name: device.name })}
                  >
                    <span
                      className={`${styles.deviceBarFill} ${
                        ratio >= 1 ? styles.deviceBarFull : ratio >= 0.8 ? styles.deviceBarWarn : ''
                      }`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
