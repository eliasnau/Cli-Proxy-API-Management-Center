import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import type { DeviceAccount } from '@/services/api';
import { accountName, providerName } from './deviceAccess';
import styles from './DevicesPage.module.scss';

export interface AccessDraft {
  allowedProviders: string[];
  allowedAuths: string[];
  /** Comma separated model patterns, as typed. */
  models: string;
}

interface AccessEditorProps {
  value: AccessDraft;
  onChange: (next: AccessDraft) => void;
  /** null while loading. */
  accounts: DeviceAccount[] | null;
  /** Providers that have at least one account. */
  providers: string[];
  loadFailed?: boolean;
}

/**
 * "Access" section of the device form: which providers and, optionally, which specific
 * accounts the device may be served by. Empty selections mean "all".
 */
export function AccessEditor({
  value,
  onChange,
  accounts,
  providers,
  loadFailed,
}: AccessEditorProps) {
  const { t } = useTranslation();
  const id = useId();

  // Keep stale selections visible so they can be removed.
  const providerOptions = useMemo(
    () => [...new Set([...providers, ...value.allowedProviders])].sort(),
    [providers, value.allowedProviders]
  );

  const visibleAccounts = useMemo(() => {
    const list = accounts ?? [];
    const filtered =
      value.allowedProviders.length === 0
        ? list
        : list.filter((a) => value.allowedProviders.includes(a.provider));
    const known = new Set(list.map((a) => a.id));
    const missing = value.allowedAuths
      .filter((authId) => !known.has(authId))
      .map<DeviceAccount>((authId) => ({
        id: authId,
        provider: '',
        label: '',
        email: '',
        name: '',
        disabled: true,
      }));
    return [...filtered, ...missing];
  }, [accounts, value.allowedProviders, value.allowedAuths]);

  const toggleProvider = (provider: string) => {
    const selected = value.allowedProviders.includes(provider)
      ? value.allowedProviders.filter((p) => p !== provider)
      : [...value.allowedProviders, provider];
    // Drop accounts whose provider is no longer allowed.
    const byId = new Map((accounts ?? []).map((a) => [a.id, a]));
    const allowedAuths =
      selected.length === 0
        ? value.allowedAuths
        : value.allowedAuths.filter((authId) => {
            const account = byId.get(authId);
            return !account || selected.includes(account.provider);
          });
    onChange({ ...value, allowedProviders: selected, allowedAuths });
  };

  const toggleAccount = (authId: string, checked: boolean) =>
    onChange({
      ...value,
      allowedAuths: checked
        ? [...value.allowedAuths, authId]
        : value.allowedAuths.filter((a) => a !== authId),
    });

  const allProviders = value.allowedProviders.length === 0;

  return (
    <fieldset className={styles.access}>
      <legend className={styles.accessTitle}>{t('devices.access_title')}</legend>
      <p className={styles.accessHint}>{t('devices.access_hint')}</p>

      <span id={`${id}-providers`} className={styles.accessLabel}>
        {t('devices.access_providers')}
      </span>
      <div className={styles.chips} role="group" aria-labelledby={`${id}-providers`}>
        <button
          type="button"
          className={`${styles.chip} ${allProviders ? styles.chipActive : ''}`}
          aria-pressed={allProviders}
          onClick={() => onChange({ ...value, allowedProviders: [] })}
        >
          {t('devices.access_all_providers')}
        </button>
        {providerOptions.map((provider) => {
          const active = value.allowedProviders.includes(provider);
          return (
            <button
              key={provider}
              type="button"
              className={`${styles.chip} ${active ? styles.chipActive : ''}`}
              aria-pressed={active}
              onClick={() => toggleProvider(provider)}
            >
              {providerName(provider)}
            </button>
          );
        })}
        {accounts !== null && providerOptions.length === 0 ? (
          <span className={styles.accessMuted}>{t('devices.access_no_accounts')}</span>
        ) : null}
      </div>

      <span id={`${id}-accounts`} className={styles.accessLabel}>
        {t('devices.access_accounts')}
        <span className={styles.accessMuted}>
          {value.allowedAuths.length === 0
            ? t('devices.access_any_account')
            : t('devices.access_selected', { count: value.allowedAuths.length })}
        </span>
      </span>
      {accounts === null ? (
        <span className={styles.accessMuted}>
          {loadFailed ? t('devices.access_load_failed') : t('devices.access_loading')}
        </span>
      ) : visibleAccounts.length === 0 ? (
        <span className={styles.accessMuted}>{t('devices.access_no_accounts')}</span>
      ) : (
        <div className={styles.accountList} role="group" aria-labelledby={`${id}-accounts`}>
          {visibleAccounts.map((account) => (
            <SelectionCheckbox
              key={account.id}
              className={styles.accountOption}
              checked={value.allowedAuths.includes(account.id)}
              onChange={(checked) => toggleAccount(account.id, checked)}
              title={account.id}
              label={
                <span className={styles.accountText}>
                  <span className={styles.accountProvider}>
                    {account.provider ? providerName(account.provider) : '?'}
                  </span>
                  <span className={styles.accountName}>{accountName(account)}</span>
                  {account.disabled ? (
                    <span className={styles.accessMuted}>{t('devices.access_account_off')}</span>
                  ) : null}
                </span>
              }
            />
          ))}
        </div>
      )}

      <Input
        label={t('devices.access_models')}
        hint={t('devices.access_models_hint')}
        value={value.models}
        placeholder="claude-sonnet-*, gpt-5*"
        onChange={(e) => onChange({ ...value, models: e.target.value })}
      />
    </fieldset>
  );
}
