import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs, type TabItem } from '@/components/page';
import { Button } from '@/components/ui/Button';
import { IconPlus } from '@/components/ui/icons';
import { AuthFilesPage } from '@/features/authFiles/AuthFilesPage';
import { OAuthPage } from '@/features/oauth/OAuthPage';
import { ProvidersWorkbenchPage } from '@/features/providers/ProvidersWorkbenchPage';
import styles from './AccountsPage.module.scss';

export type AccountsTab = 'auth-files' | 'providers' | 'add';

const ACCOUNTS_TABS: readonly AccountsTab[] = ['auth-files', 'providers', 'add'];
const DEFAULT_TAB: AccountsTab = 'auth-files';

const isAccountsTab = (value: unknown): value is AccountsTab =>
  typeof value === 'string' && (ACCOUNTS_TABS as readonly string[]).includes(value);

export interface AccountsPageProps {
  /** Tab shown when the URL has no valid `?tab=` (e.g. /ai-providers → "providers"). */
  initialTab?: AccountsTab;
}

/**
 * Accounts: one page for everything that holds credentials.
 * Auth files (default) · API providers · Add account (OAuth login, upload, API key).
 * The active tab lives in `?tab=` so legacy routes can map onto it.
 */
export function AccountsPage({ initialTab = DEFAULT_TAB }: AccountsPageProps = {}) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const idPrefix = useId();
  const [pendingUpload, setPendingUpload] = useState(false);

  const tabParam = searchParams.get('tab');
  const tab: AccountsTab = isAccountsTab(tabParam) ? tabParam : initialTab;

  const setTab = useCallback(
    (next: AccountsTab) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set('tab', next);
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const uploadAuthFile = useCallback(() => {
    setPendingUpload(true);
    setTab('auth-files');
  }, [setTab]);

  const clearPendingUpload = useCallback(() => setPendingUpload(false), []);
  const showAuthFiles = useCallback(() => setTab('auth-files'), [setTab]);
  const showAdd = useCallback(() => setTab('add'), [setTab]);

  const tabItems: TabItem<AccountsTab>[] = [
    { id: 'auth-files', label: t('accounts.tab_auth_files') },
    { id: 'providers', label: t('accounts.tab_providers') },
    { id: 'add', label: t('accounts.tab_add') },
  ];
  const getTabId = (id: AccountsTab) => `${idPrefix}-tab-${id}`;
  const getPanelId = (id: AccountsTab) => `${idPrefix}-panel-${id}`;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('accounts.title')}
        subtitle={t('accounts.subtitle')}
        actions={
          <Button size="sm" className={styles.iconTextButton} onClick={showAdd}>
            <IconPlus size={14} />
            {t('accounts.add')}
          </Button>
        }
      >
        <Tabs
          items={tabItems}
          value={tab}
          onChange={setTab}
          ariaLabel={t('accounts.title')}
          getTabId={getTabId}
          getPanelId={getPanelId}
        />
      </PageHeader>

      <div
        role="tabpanel"
        id={getPanelId(tab)}
        aria-labelledby={getTabId(tab)}
        className={styles.panel}
      >
        {tab === 'auth-files' ? (
          <AuthFilesPage
            embedded
            autoUpload={pendingUpload}
            onAutoUploadHandled={clearPendingUpload}
            onOpenOAuth={showAdd}
          />
        ) : tab === 'providers' ? (
          <ProvidersWorkbenchPage embedded />
        ) : (
          <div className={styles.addPanel}>
            <section className={styles.oauthSection} aria-labelledby={`${idPrefix}-oauth`}>
              <h2 className={styles.sectionTitle} id={`${idPrefix}-oauth`}>
                {t('accounts.add_oauth_title')}
              </h2>
              <OAuthPage embedded onViewAuthFiles={showAuthFiles} />
            </section>

            <div className={styles.alternatives}>
              <div className={styles.alternative}>
                <p className={styles.alternativeText}>{t('accounts.add_file_hint')}</p>
                <Button variant="secondary" size="sm" onClick={uploadAuthFile}>
                  {t('auth_files.upload_button')}
                </Button>
              </div>
              <div className={styles.alternative}>
                <p className={styles.alternativeText}>{t('accounts.add_provider_hint')}</p>
                <Button variant="secondary" size="sm" onClick={() => setTab('providers')}>
                  {t('accounts.add_provider_action')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
