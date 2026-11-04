import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
import type { HeaderMetaSegment } from '../uiState';

export type ConfigHeaderProps = {
  /** 状态段（uiState.buildHeaderMeta 的产物）；只展示需要关注的状态，常态（字段数 / 已同步）不显示。 */
  meta: HeaderMetaSegment[];
  reloadDisabled: boolean;
  reloading: boolean;
  onReload: () => void;
  /** 动作区里重载按钮之前的控件（可视化/源码切换）。 */
  extraActions?: ReactNode;
  /** 标题下方的行（tabs）。 */
  children?: ReactNode;
};

const QUIET_SEGMENTS: ReadonlySet<HeaderMetaSegment['key']> = new Set(['fields', 'synced']);

/**
 * 配置面板头部：共享 PageHeader（标题 + 仅在需要时出现的一行状态 + 右侧动作）。
 * 保存动作不在头部常驻 —— 由 FloatingSaveBar 在 dirty 时承载。
 */
export function ConfigHeader({
  meta,
  reloadDisabled,
  reloading,
  onReload,
  extraActions,
  children,
}: ConfigHeaderProps) {
  const { t } = useTranslation();
  const subtitle = meta
    .filter((segment) => !QUIET_SEGMENTS.has(segment.key))
    .map((segment) =>
      segment.count !== undefined
        ? t(segment.labelKey, { count: segment.count })
        : t(segment.labelKey)
    )
    .join(' · ');

  return (
    <PageHeader
      title={t('config_management.title')}
      subtitle={subtitle || undefined}
      actions={
        <>
          {extraActions}
          <Button
            variant="secondary"
            size="sm"
            onClick={onReload}
            disabled={reloadDisabled}
            loading={reloading}
          >
            {reloading ? null : <IconRefreshCw size={14} />}
            {t('config_management.reload')}
          </Button>
        </>
      }
    >
      {children}
    </PageHeader>
  );
}
