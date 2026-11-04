import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getTypeLabel, type ResolvedTheme } from '@/features/authFiles/constants';
import { scrollProviderTabs } from './providerTabsWheel';
import styles from './ProviderTabs.module.scss';

export type ProviderTabsProps = {
  types: string[];
  counts: Record<string, number>;
  active: string;
  /** Kept for API compatibility; tabs are text-only now. */
  resolvedTheme?: ResolvedTheme;
  onChange: (type: string) => void;
};

/**
 * 提供商过滤 tabs：小号下划线式，纯文字 + 计数（无图标）。
 * 水平排布，支持鼠标滚轮与触屏横向滚动。
 */
export function ProviderTabs({ types, counts, active, onChange }: ProviderTabsProps) {
  const { t } = useTranslation();
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = tabsRef.current;
    if (!strip) return;
    const onWheel = (event: WheelEvent) => scrollProviderTabs(strip, event);
    // React delegates wheel events passively; use a local listener to prevent page scrolling.
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => strip.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div ref={tabsRef} className={styles.tabs} role="group" aria-label={t('auth_files.filter_all')}>
      {types.map((type) => {
        const isActive = active === type;
        const label = type === 'all' ? t('auth_files.filter_all') : getTypeLabel(t, type);

        return (
          <button
            key={type}
            type="button"
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            aria-pressed={isActive}
            onClick={() => onChange(type)}
          >
            <span className={styles.tabLabel}>{label}</span>
            <span className={styles.tabCount}>{counts[type] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
