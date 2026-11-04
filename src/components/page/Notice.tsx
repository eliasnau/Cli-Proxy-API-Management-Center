import type { ReactNode } from 'react';
import { IconAlertTriangle, IconInfo } from '@/components/ui/icons';
import styles from './page.module.scss';

export type NoticeTone = 'info' | 'warning' | 'error';

export interface NoticeProps {
  tone?: NoticeTone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Subtle inline notice: small icon + one line of text, no pill, no fill. */
export function Notice({ tone = 'info', children, action, className }: NoticeProps) {
  const toneClass =
    tone === 'error' ? styles.noticeError : tone === 'warning' ? styles.noticeWarning : '';
  return (
    <div
      className={[styles.notice, toneClass, className].filter(Boolean).join(' ')}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className={styles.noticeIcon} aria-hidden="true">
        {tone === 'info' ? <IconInfo size={14} /> : <IconAlertTriangle size={14} />}
      </span>
      <div className={styles.noticeText}>{children}</div>
      {action ? <div className={styles.noticeAction}>{action}</div> : null}
    </div>
  );
}
