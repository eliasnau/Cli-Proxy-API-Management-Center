import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Notice, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconGithub, IconBookOpen, IconExternalLink, IconCode } from '@/components/ui/icons';
import {
  useAuthStore,
  useConfigStore,
  useNotificationStore,
  useModelsStore,
  useThemeStore,
} from '@/stores';
import { configApi, versionApi } from '@/services/api';
import { useApiKeysForModels } from '@/hooks/useApiKeysForModels';
import { formatDateTimeValue } from '@/utils/format';
import { classifyModels } from '@/utils/models';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import iconGemini from '@/assets/icons/gemini.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconMeta from '@/assets/icons/meta.svg';
import iconDevinLight from '@/assets/icons/devin.svg';
import iconDevinDark from '@/assets/icons/devin-dark.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconGrokDark from '@/assets/icons/grok-dark.svg';
import iconDeepseek from '@/assets/icons/deepseek.svg';
import iconMinimax from '@/assets/icons/minimax.svg';
import iconXiaomi from '@/assets/icons/xiaomi.svg';
import iconStepfun from '@/assets/icons/stepfun.svg';
import iconStepfunDark from '@/assets/icons/stepfun-dark.svg';
import styles from './SystemPage.module.scss';

const MODEL_CATEGORY_ICONS: Record<string, string | { light: string; dark: string }> = {
  devin: { light: iconDevinLight, dark: iconDevinDark },
  gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
  claude: iconClaude,
  meta: iconMeta,
  gemini: iconGemini,
  qwen: iconQwen,
  kimi: { light: iconKimiDark, dark: iconKimiLight },
  glm: iconGlm,
  grok: { light: iconGrok, dark: iconGrokDark },
  deepseek: iconDeepseek,
  minimax: iconMinimax,
  xiaomi: iconXiaomi,
  stepfun: { light: iconStepfun, dark: iconStepfunDark },
};

const parseVersionSegments = (version?: string | null) => {
  if (!version) return null;
  const cleaned = version.trim().replace(/^v/i, '');
  if (!cleaned) return null;
  const parts = cleaned
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((segment) => Number.parseInt(segment, 10))
    .filter(Number.isFinite);
  return parts.length ? parts : null;
};

const compareVersions = (latest?: string | null, current?: string | null) => {
  const latestParts = parseVersionSegments(latest);
  const currentParts = parseVersionSegments(current);
  if (!latestParts || !currentParts) return null;
  const length = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return 1;
    if (l < c) return -1;
  }
  return 0;
};

export function SystemPage() {
  const { t, i18n } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const auth = useAuthStore();
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const modelsError = useModelsStore((state) => state.error);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [modelStatus, setModelStatus] = useState<{
    type: 'success' | 'warning' | 'error' | 'muted';
    message: string;
  }>();
  const [requestLogModalOpen, setRequestLogModalOpen] = useState(false);
  const [requestLogDraft, setRequestLogDraft] = useState(false);
  const [requestLogTouched, setRequestLogTouched] = useState(false);
  const [requestLogSaving, setRequestLogSaving] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(false);

  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherLabel = useMemo(
    () => (i18n.language?.toLowerCase().startsWith('zh') ? '其他' : 'Other'),
    [i18n.language]
  );
  const groupedModels = useMemo(() => classifyModels(models, { otherLabel }), [models, otherLabel]);
  const requestLogEnabled = config?.requestLog ?? false;
  const requestLogDirty = requestLogDraft !== requestLogEnabled;
  const canEditRequestLog = auth.connectionStatus === 'connected' && Boolean(config);

  const appVersion = __APP_VERSION__ || t('system_info.version_unknown');
  const apiVersion = auth.serverVersion || t('system_info.version_unknown');
  const buildTime =
    formatDateTimeValue(auth.serverBuildDate, i18n.language) || t('system_info.version_unknown');

  const getIconForCategory = (categoryId: string): string | null => {
    const iconEntry = MODEL_CATEGORY_ICONS[categoryId];
    if (!iconEntry) return null;
    if (typeof iconEntry === 'string') return iconEntry;
    return resolvedTheme === 'dark' ? iconEntry.dark : iconEntry.light;
  };

  const resolveApiKeysForModels = useApiKeysForModels();

  const fetchModels = async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
    if (auth.connectionStatus !== 'connected') {
      setModelStatus({
        type: 'warning',
        message: t('notification.connection_required'),
      });
      return;
    }

    if (!auth.apiBase) {
      showNotification(t('notification.connection_required'), 'warning');
      return;
    }

    setModelStatus({ type: 'muted', message: t('system_info.models_loading') });
    try {
      const apiKeys = await resolveApiKeysForModels({ force: forceRefresh });
      const primaryKey = apiKeys[0];
      const list = await fetchModelsFromStore(auth.apiBase, primaryKey, forceRefresh);
      const hasModels = list.length > 0;
      setModelStatus({
        type: hasModels ? 'success' : 'warning',
        message: hasModels
          ? t('system_info.models_count', { count: list.length })
          : t('system_info.models_empty'),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const suffix = message ? `: ${message}` : '';
      const text = `${t('system_info.models_error')}${suffix}`;
      setModelStatus({ type: 'error', message: text });
    }
  };

  const handleClearLoginStorage = () => {
    showConfirmation({
      title: t('system_info.clear_login_title', { defaultValue: 'Clear Login Storage' }),
      message: t('system_info.clear_login_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: () => {
        auth.logout();
        if (typeof localStorage === 'undefined') return;
        const keysToRemove = [STORAGE_KEY_AUTH, 'isLoggedIn', 'apiBase', 'apiUrl', 'managementKey'];
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        showNotification(t('notification.login_storage_cleared'), 'success');
      },
    });
  };

  const openRequestLogModal = useCallback(() => {
    setRequestLogTouched(false);
    setRequestLogDraft(requestLogEnabled);
    setRequestLogModalOpen(true);
  }, [requestLogEnabled]);

  const handleInfoVersionTap = useCallback(() => {
    versionTapCount.current += 1;
    if (versionTapTimer.current) {
      clearTimeout(versionTapTimer.current);
    }

    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
      openRequestLogModal();
      return;
    }

    versionTapTimer.current = setTimeout(() => {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
    }, 1500);
  }, [openRequestLogModal]);

  const handleRequestLogClose = useCallback(() => {
    setRequestLogModalOpen(false);
    setRequestLogTouched(false);
  }, []);

  const handleRequestLogSave = async () => {
    if (!canEditRequestLog) return;
    if (!requestLogDirty) {
      setRequestLogModalOpen(false);
      return;
    }

    const previous = requestLogEnabled;
    setRequestLogSaving(true);
    updateConfigValue('request-log', requestLogDraft);

    try {
      await configApi.updateRequestLog(requestLogDraft);
      clearCache('request-log');
      showNotification(t('notification.request_log_updated'), 'success');
      setRequestLogModalOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('request-log', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setRequestLogSaving(false);
    }
  };

  const handleVersionCheck = useCallback(async () => {
    setCheckingVersion(true);
    try {
      const data = await versionApi.checkLatest();
      const latestRaw = data?.['latest-version'] ?? data?.latest_version ?? data?.latest ?? '';
      const latest = typeof latestRaw === 'string' ? latestRaw : String(latestRaw ?? '');
      const comparison = compareVersions(latest, auth.serverVersion);

      if (!latest) {
        showNotification(t('system_info.version_check_error'), 'error');
        return;
      }

      if (comparison === null) {
        showNotification(t('system_info.version_current_missing'), 'warning');
        return;
      }

      if (comparison > 0) {
        showNotification(t('system_info.version_update_available', { version: latest }), 'warning');
      } else {
        showNotification(t('system_info.version_is_latest'), 'success');
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      const suffix = message ? `: ${message}` : '';
      showNotification(`${t('system_info.version_check_error')}${suffix}`, 'error');
    } finally {
      setCheckingVersion(false);
    }
  }, [auth.serverVersion, showNotification, t]);

  useEffect(() => {
    fetchConfig().catch(() => {
      // ignore
    });
  }, [fetchConfig]);

  useEffect(() => {
    if (requestLogModalOpen && !requestLogTouched) {
      setRequestLogDraft(requestLogEnabled);
    }
  }, [requestLogModalOpen, requestLogTouched, requestLogEnabled]);

  useEffect(() => {
    return () => {
      if (versionTapTimer.current) {
        clearTimeout(versionTapTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.connectionStatus, auth.apiBase]);

  const quickLinks = [
    {
      href: 'https://github.com/router-for-me/CLIProxyAPI',
      icon: <IconGithub size={16} />,
      title: t('system_info.link_main_repo'),
      desc: t('system_info.link_main_repo_desc'),
    },
    {
      href: 'https://github.com/router-for-me/Cli-Proxy-API-Management-Center',
      icon: <IconCode size={16} />,
      title: t('system_info.link_webui_repo'),
      desc: t('system_info.link_webui_repo_desc'),
    },
    {
      href: 'https://help.router-for.me/',
      icon: <IconBookOpen size={16} />,
      title: t('system_info.link_docs'),
      desc: t('system_info.link_docs_desc'),
    },
  ];

  return (
    <div className={styles.container}>
      <PageHeader title={t('system_info.title')} />

      <section className={styles.card}>
        <div className={styles.aboutHeader}>
          <img src={INLINE_LOGO_JPEG} alt="CPAMC" className={styles.aboutLogo} />
          <h2 className={styles.cardTitle}>{t('system_info.about_title')}</h2>
        </div>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt className={styles.rowLabel}>{t('footer.version')}</dt>
            <dd className={styles.rowValue}>
              <button type="button" className={styles.tapValue} onClick={handleInfoVersionTap}>
                {appVersion}
              </button>
            </dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.rowLabel}>{t('footer.api_version')}</dt>
            <dd className={styles.rowValue}>
              <span>{apiVersion}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={styles.inlineAction}
                onClick={() => void handleVersionCheck()}
                loading={checkingVersion}
              >
                {t('system_info.version_check_button')}
              </Button>
            </dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.rowLabel}>{t('footer.build_date')}</dt>
            <dd className={styles.rowValue}>{buildTime}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.rowLabel}>{t('connection.status')}</dt>
            <dd className={styles.rowValue}>
              <span>{t(`common.${auth.connectionStatus}_status`)}</span>
              <span className={styles.rowSub} title={auth.apiBase || undefined}>
                {auth.apiBase || '-'}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeading}>
            <h2 className={styles.cardTitle}>{t('system_info.quick_links_title')}</h2>
            <p className={styles.cardDesc}>{t('system_info.quick_links_desc')}</p>
          </div>
        </div>
        <ul className={styles.linkList}>
          {quickLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkRow}
              >
                <span className={styles.linkIcon} aria-hidden="true">
                  {link.icon}
                </span>
                <span className={styles.linkText}>
                  <span className={styles.linkTitle}>{link.title}</span>
                  <span className={styles.linkDesc}>{link.desc}</span>
                </span>
                <IconExternalLink size={14} className={styles.linkExternal} />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeading}>
            <h2 className={styles.cardTitle}>{t('system_info.models_title')}</h2>
            <p className={styles.cardDesc}>{t('system_info.models_desc')}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchModels({ forceRefresh: true })}
            loading={modelsLoading}
          >
            {t('common.refresh')}
          </Button>
        </div>
        {modelStatus &&
          (modelStatus.type === 'warning' || modelStatus.type === 'error' ? (
            <Notice tone={modelStatus.type} className={styles.cardNotice}>
              {modelStatus.message}
            </Notice>
          ) : (
            <p className={styles.statusLine} role="status">
              {modelStatus.message}
            </p>
          ))}
        {modelsError && (
          <Notice tone="error" className={styles.cardNotice}>
            {modelsError}
          </Notice>
        )}
        {modelsLoading ? (
          <p className={styles.mutedLine}>{t('common.loading')}</p>
        ) : models.length === 0 ? (
          <p className={styles.mutedLine}>{t('system_info.models_empty')}</p>
        ) : (
          <ul className={styles.modelGroups}>
            {groupedModels.map((group) => {
              const iconSrc = getIconForCategory(group.id);
              return (
                <li key={group.id} className={styles.modelGroup}>
                  <div className={styles.groupTitle}>
                    {iconSrc && <img src={iconSrc} alt="" className={styles.groupIcon} />}
                    <span className={styles.groupName}>{group.label}</span>
                    <span className={styles.groupCount}>
                      {t('system_info.models_count', { count: group.items.length })}
                    </span>
                  </div>
                  <div className={styles.modelTags}>
                    {group.items.map((model) => (
                      <span
                        key={`${model.name}-${model.alias ?? 'default'}`}
                        className={styles.modelTag}
                        title={model.description || ''}
                      >
                        <span className={styles.modelName}>{model.name}</span>
                        {model.alias && <span className={styles.modelAlias}>{model.alias}</span>}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${styles.card} ${styles.cardInline}`}>
        <div className={styles.cardHeading}>
          <h2 className={styles.cardTitle}>{t('system_info.clear_login_title')}</h2>
          <p className={styles.cardDesc}>{t('system_info.clear_login_desc')}</p>
        </div>
        <Button variant="danger" size="sm" onClick={handleClearLoginStorage}>
          {t('system_info.clear_login_button')}
        </Button>
      </section>

      <Modal
        open={requestLogModalOpen}
        onClose={handleRequestLogClose}
        title={t('basic_settings.request_log_title')}
        footer={
          <>
            <Button variant="secondary" onClick={handleRequestLogClose} disabled={requestLogSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRequestLogSave}
              loading={requestLogSaving}
              disabled={!canEditRequestLog || !requestLogDirty}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="request-log-modal">
          <Notice tone="warning">{t('basic_settings.request_log_warning')}</Notice>
          <ToggleSwitch
            label={t('basic_settings.request_log_enable')}
            labelPosition="left"
            checked={requestLogDraft}
            disabled={!canEditRequestLog || requestLogSaving}
            onChange={(value) => {
              setRequestLogDraft(value);
              setRequestLogTouched(true);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
