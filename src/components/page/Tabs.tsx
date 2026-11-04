import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import styles from './page.module.scss';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  /** Small count/marker shown after the label. */
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** underline (default) for page-level sections, segmented for small toggles. */
  variant?: 'underline' | 'segmented';
  ariaLabel?: string;
  className?: string;
  /** Optional id builders to wire tabs to their panels. */
  getTabId?: (id: T) => string;
  getPanelId?: (id: T) => string;
}

/** Small tab row: underlined or segmented. Arrow keys move between tabs. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant = 'underline',
  ariaLabel,
  className,
  getTabId,
  getPanelId,
}: TabsProps<T>) {
  const refs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});
  const enabled = items.filter((item) => !item.disabled);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = enabled.findIndex((item) => item.id === value);
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % enabled.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + enabled.length) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const id = enabled[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        variant === 'segmented' ? styles.segmented : styles.tabs,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[item.id] = node;
            }}
            type="button"
            role="tab"
            id={getTabId?.(item.id)}
            aria-controls={getPanelId?.(item.id)}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            onClick={() => onChange(item.id)}
            onKeyDown={handleKeyDown}
          >
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge !== null ? (
              <span className={styles.tabBadge}>{item.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
