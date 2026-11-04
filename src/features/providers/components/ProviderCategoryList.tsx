import { useTranslation } from 'react-i18next';
import { PROVIDER_LOGOS } from '../brandLogos';
import type { ProviderBrand, ProviderGroup } from '../types';
import styles from './ProviderCategoryList.module.scss';

interface ProviderCategoryListProps {
  groups: ProviderGroup[];
  activeBrand: ProviderBrand;
  onSelect: (brand: ProviderBrand) => void;
}

const QUICK_FILL_BRAND_ORDER: readonly ProviderBrand[] = ['fennoAI', 'qiniuCloud'];

const QUICK_FILL_BRANDS: ReadonlySet<ProviderBrand> = new Set(QUICK_FILL_BRAND_ORDER);

export function ProviderCategoryList({ groups, activeBrand, onSelect }: ProviderCategoryListProps) {
  const { t } = useTranslation();

  const quickFillGroups = groups
    .filter((g) => QUICK_FILL_BRANDS.has(g.id))
    .sort(
      (left, right) =>
        QUICK_FILL_BRAND_ORDER.indexOf(left.id) - QUICK_FILL_BRAND_ORDER.indexOf(right.id)
    );
  const providerGroups = groups.filter((g) => !QUICK_FILL_BRANDS.has(g.id));

  const renderGroups = (items: ProviderGroup[]) => (
    <div className={styles.list}>
      {items.map((group) => {
        const active = group.id === activeBrand;
        const total = group.resources.length;
        const activeCount = group.resources.filter((r) => !r.disabled).length;
        const logo = PROVIDER_LOGOS[group.id];
        const itemClass = active ? `${styles.item} ${styles.active}` : styles.item;
        const logoClassName = [
          styles.logo,
          logo?.transparent ? styles.logoTransparent : '',
          logo?.themeSurface ? styles.logoThemeSurface : '',
          logo?.darkSrc ? styles.logoThemeLight : '',
          logo?.invertOnDark ? styles.logoInvertOnDark : '',
        ]
          .filter(Boolean)
          .join(' ');
        const darkLogoClassName = [
          styles.logo,
          logo?.transparent ? styles.logoTransparent : '',
          logo?.themeSurface ? styles.logoThemeSurface : '',
          styles.logoThemeDark,
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={group.id}
            type="button"
            className={itemClass}
            onClick={() => onSelect(group.id)}
            aria-current={active ? 'page' : undefined}
          >
            <span className={styles.itemLeft}>
              {logo ? (
                <>
                  <img src={logo.src} alt="" aria-hidden="true" className={logoClassName} />
                  {logo.darkSrc ? (
                    <img
                      src={logo.darkSrc}
                      alt=""
                      aria-hidden="true"
                      className={darkLogoClassName}
                    />
                  ) : null}
                </>
              ) : null}
              <span className={styles.itemTitle}>
                {t(`providersPage.providerNames.${group.id}`)}
              </span>
            </span>
            <span
              className={[styles.badge, total === 0 ? styles.badgeEmpty : '']
                .filter(Boolean)
                .join(' ')}
              title={t('providersPage.categories.activeCount', {
                active: activeCount,
                total,
              })}
            >
              {activeCount === total ? total : `${activeCount}/${total}`}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <nav className={styles.stack} aria-label={t('providersPage.categories.title')}>
      <p className={styles.label}>{t('providersPage.categories.title')}</p>
      {renderGroups(providerGroups)}
      {quickFillGroups.length > 0 && (
        <>
          <p className={styles.label}>{t('providersPage.categories.quickFill')}</p>
          {renderGroups(quickFillGroups)}
        </>
      )}
    </nav>
  );
}
