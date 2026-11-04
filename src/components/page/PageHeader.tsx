import type { ReactNode } from 'react';
import styles from './page.module.scss';

export interface PageHeaderProps {
  title: ReactNode;
  /** One muted line under the title. Keep it short. */
  subtitle?: ReactNode;
  /** Right-aligned actions (buttons, selects). */
  actions?: ReactNode;
  /** Optional row rendered under the header (tabs, filters). */
  children?: ReactNode;
  className?: string;
}

/** Compact page header shared by every page of the shell: 20px title, muted subtitle, actions right. */
export function PageHeader({ title, subtitle, actions, children, className }: PageHeaderProps) {
  return (
    <header className={className ? `${styles.header} ${className}` : styles.header}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
