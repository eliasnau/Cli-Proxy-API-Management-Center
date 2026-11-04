import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { routingApi } from '@/services/api/routing';
import { useConfigStore, useNotificationStore } from '@/stores';
import { ROUTING_STRATEGIES, type RoutingSettings, type RoutingStrategy } from '@/types/routing';
import { getErrorMessage } from '@/utils/helpers';
import styles from '../dashboard.module.scss';

const strategyKey = (strategy: RoutingStrategy) => strategy.replace(/-/g, '_');

const RETRY_MAX = 100;
const CREDENTIALS_MAX = 1000;

const readCount = (value: string, max: number): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : 0;
};

const changedSettings = (saved: RoutingSettings, draft: RoutingSettings) => {
  const changes: Partial<RoutingSettings> = {};
  (Object.keys(draft) as Array<keyof RoutingSettings>).forEach((key) => {
    if (draft[key] !== saved[key]) Object.assign(changes, { [key]: draft[key] });
  });
  return changes;
};

/** Compact editor for the core `routing:` settings; the Routing page holds the rest. */
export function RoutingCard({
  connected,
  reloadToken,
}: {
  connected: boolean;
  reloadToken: number;
}) {
  const { t } = useTranslation();
  const id = useId();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const clearConfigCache = useConfigStore((state) => state.clearCache);
  const [saved, setSaved] = useState<RoutingSettings | null>(null);
  const [draft, setDraft] = useState<RoutingSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const dirtyRef = useRef(false);

  const changes = saved && draft ? changedSettings(saved, draft) : {};
  const dirty = Object.keys(changes).length > 0;
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const load = useCallback(async () => {
    const current = ++seq.current;
    setFailed(false);
    try {
      const settings = await routingApi.getSettings();
      if (current !== seq.current) return;
      setSaved(settings);
      // Keep unsaved edits across a background refresh.
      if (!dirtyRef.current) setDraft(settings);
    } catch {
      if (current === seq.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load, reloadToken]);

  const save = async () => {
    if (!dirty || !draft) return;
    setSaving(true);
    try {
      await routingApi.saveSettings(changes);
      clearConfigCache();
      setSaved(draft);
      showNotification(t('dashboard.routing_saved'), 'success');
    } catch (error) {
      showNotification(getErrorMessage(error, t('dashboard.routing_save_failed')), 'error');
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<RoutingSettings>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const disabled = !connected || saving || draft === null;

  return (
    <section className={styles.card} aria-labelledby={`${id}-title`}>
      <header className={styles.cardHead}>
        <h2 id={`${id}-title`} className={styles.cardTitle}>
          {t('dashboard.routing_title')}
        </h2>
        <Link to="/routing" className={styles.cardLink}>
          {t('dashboard.routing_open')}
        </Link>
      </header>
      {draft === null ? (
        <p className={styles.empty}>
          {failed ? t('dashboard.routing_load_failed') : t('common.loading')}
        </p>
      ) : (
        <div className={styles.settings}>
          <div className={styles.settingRow}>
            <span id={`${id}-strategy`} className={styles.settingLabel}>
              {t('routing.strategy_label')}
              <span className={styles.settingHint}>
                {t(`routing.strategy_${strategyKey(draft.strategy)}_desc`)}
              </span>
            </span>
            <div className={styles.segmented} role="radiogroup" aria-labelledby={`${id}-strategy`}>
              {ROUTING_STRATEGIES.map((strategy) => (
                <button
                  key={strategy}
                  type="button"
                  role="radio"
                  aria-checked={draft.strategy === strategy}
                  className={draft.strategy === strategy ? styles.segActive : undefined}
                  disabled={disabled}
                  onClick={() => update({ strategy })}
                >
                  {t(`routing.strategy_${strategyKey(strategy)}`)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>
              {t('routing.affinity_label')}
              <span id={`${id}-affinity`} className={styles.settingHint}>
                {t('routing.affinity_desc')}
              </span>
            </span>
            <ToggleSwitch
              checked={draft.sessionAffinity}
              disabled={disabled}
              onChange={(sessionAffinity) => update({ sessionAffinity })}
              ariaLabel={t('routing.affinity_label')}
              ariaDescribedBy={`${id}-affinity`}
            />
          </div>

          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>
              {t('routing.retry_label')}
              <span className={styles.settingHint}>{t('routing.max_retry_credentials_desc')}</span>
            </span>
            <div className={styles.numberPair}>
              <label className={styles.numberField}>
                <span>{t('routing.request_retry')}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={RETRY_MAX}
                  value={draft.requestRetry}
                  disabled={disabled}
                  onChange={(e) => update({ requestRetry: readCount(e.target.value, RETRY_MAX) })}
                />
              </label>
              <label className={styles.numberField}>
                <span>{t('routing.max_retry_credentials')}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={CREDENTIALS_MAX}
                  value={draft.maxRetryCredentials}
                  disabled={disabled}
                  onChange={(e) =>
                    update({ maxRetryCredentials: readCount(e.target.value, CREDENTIALS_MAX) })
                  }
                />
              </label>
            </div>
          </div>

          {dirty ? (
            <div className={styles.settingActions}>
              <Button
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => saved && setDraft(saved)}
              >
                {t('routing.discard')}
              </Button>
              <Button size="sm" loading={saving} onClick={() => void save()}>
                {t('common.save')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
