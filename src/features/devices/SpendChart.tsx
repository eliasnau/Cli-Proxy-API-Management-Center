import { useEffect, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDayLabel, formatUsd, formatUsdCompact } from './deviceFormat';
import { niceTicks, type MonthWindow, type StackSeries } from './usageModel';
import { seriesColor, useElementWidth } from './chartUtils';
import styles from './DevicesPage.module.scss';

/** Rect path with only the top corners rounded (data end), flat on the baseline. */
const topRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${
    x + w
  },${y + rr}V${y + h}Z`;
};

interface SpendChartProps {
  series: StackSeries[];
  window: MonthWindow;
  /** Optional per-day request counts per series key, shown in the tooltip. */
  requests?: Record<string, number[]>;
  height?: number;
  /** Optional horizontal reference (e.g. daily budget) drawn as a dashed line. */
  reference?: { value: number; label: string } | null;
  ariaLabel: string;
  compact?: boolean;
}

const MARGIN = { top: 14, right: 8, bottom: 24, left: 44 };
const GAP = 2;

export function SpendChart({
  series,
  window,
  requests,
  height = 248,
  reference,
  ariaLabel,
  compact = false,
}: SpendChartProps) {
  const { t, i18n } = useTranslation();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const days = window.days;
  const totals = days.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0));
  const max = Math.max(...totals, reference?.value ?? 0);
  const ticks = niceTicks(max, compact ? 3 : 4);
  const top = ticks[ticks.length - 1] || 1;

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const band = days.length > 0 ? innerW / days.length : 0;
  const barW = Math.max(2, Math.min(28, band * 0.64));
  const y = (v: number) => MARGIN.top + innerH - (v / top) * innerH;
  const xCenter = (i: number) => MARGIN.left + band * i + band / 2;
  const labelEvery = band >= 26 ? 2 : band >= 14 ? 5 : 7;

  const elapsedCount = window.isCurrent
    ? window.todayIndex + 1
    : window.elapsedDays > 0
      ? days.length
      : 0;
  const elapsedTotal = totals.slice(0, elapsedCount).reduce((a, b) => a + b, 0);
  const average = elapsedCount > 0 ? elapsedTotal / Math.max(1, window.elapsedDays) : 0;

  useEffect(() => {
    if (hover !== null && hover >= days.length) setHover(null);
  }, [days.length, hover]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const last = Math.max(0, (elapsedCount || days.length) - 1);
    setHover((h) => {
      if (h === null) return last;
      return Math.max(0, Math.min(days.length - 1, h + (event.key === 'ArrowLeft' ? -1 : 1)));
    });
  };

  const hovered = hover !== null ? hover : null;
  const tooltipLeft = hovered !== null ? xCenter(hovered) : 0;
  const flip = hovered !== null && tooltipLeft > width * 0.62;

  return (
    <div
      ref={wrapRef}
      className={styles.chartWrap}
      style={{ height }}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onBlur={() => setHover(null)}
      onMouseLeave={() => setHover(null)}
    >
      {width > 0 ? (
        <svg width={width} height={height} className={styles.chartSvg} aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                className={tick === 0 ? styles.axisBase : styles.gridLine}
              />
              <text
                x={MARGIN.left - 8}
                y={y(tick)}
                className={styles.axisLabel}
                textAnchor="end"
                dy="0.32em"
              >
                {formatUsdCompact(tick)}
              </text>
            </g>
          ))}

          {hovered !== null ? (
            <rect
              x={MARGIN.left + band * hovered}
              y={MARGIN.top}
              width={band}
              height={innerH}
              className={styles.hoverBand}
              rx={4}
            />
          ) : null}

          {days.map((day, i) => {
            const future = window.isCurrent && i > window.todayIndex;
            const x = xCenter(i) - barW / 2;
            if (future) {
              return (
                <rect
                  key={day}
                  x={x}
                  y={y(0) - 2}
                  width={barW}
                  height={2}
                  rx={1}
                  className={styles.futureTick}
                />
              );
            }
            let acc = 0;
            const visible = series.filter((s) => s.values[i] > 0);
            return (
              <g key={day} opacity={hovered === null || hovered === i ? 1 : 0.55}>
                {visible.map((s, idx) => {
                  const v = s.values[i];
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const isTop = idx === visible.length - 1;
                  // 2px surface gap between stacked segments.
                  const h = Math.max(1, y0 - y1 - (isTop ? 0 : GAP));
                  const yTop = isTop ? y1 : y1 + GAP;
                  return isTop ? (
                    <path
                      key={s.key}
                      d={topRoundedRect(x, yTop, barW, h, 3)}
                      fill={seriesColor(s.slot)}
                    />
                  ) : (
                    <rect
                      key={s.key}
                      x={x}
                      y={yTop}
                      width={barW}
                      height={h}
                      fill={seriesColor(s.slot)}
                    />
                  );
                })}
              </g>
            );
          })}

          {average > 0 && !compact ? (
            <g>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(average)}
                y2={y(average)}
                className={styles.avgLine}
              />
              <text
                x={width - MARGIN.right}
                y={y(average) - 6}
                className={styles.avgLabel}
                textAnchor="end"
              >
                {t('devices.chart_avg', { value: formatUsd(average) })}
              </text>
            </g>
          ) : null}

          {reference && reference.value > 0 ? (
            <g>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(reference.value)}
                y2={y(reference.value)}
                className={styles.refLine}
              />
              <text
                x={width - MARGIN.right}
                textAnchor="end"
                y={y(reference.value) - 6}
                className={styles.avgLabel}
              >
                {reference.label}
              </text>
            </g>
          ) : null}

          {days.map((day, i) => {
            const dayNum = i + 1;
            const show = dayNum === 1 || dayNum % labelEvery === 0 || i === window.todayIndex;
            if (!show) return null;
            if (
              i !== window.todayIndex &&
              window.todayIndex >= 0 &&
              Math.abs(i - window.todayIndex) * band < 18
            ) {
              return null;
            }
            return (
              <text
                key={day}
                x={xCenter(i)}
                y={height - 6}
                textAnchor="middle"
                className={i === window.todayIndex ? styles.axisToday : styles.axisLabel}
              >
                {i === window.todayIndex ? t('devices.chart_today') : dayNum}
              </text>
            );
          })}

          {days.map((day, i) => (
            <rect
              key={`hit-${day}`}
              x={MARGIN.left + band * i}
              y={MARGIN.top}
              width={band}
              height={innerH + MARGIN.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseMove={() => setHover(i)}
            />
          ))}
        </svg>
      ) : null}

      {hovered !== null ? (
        <div
          className={styles.tooltip}
          style={{
            left: flip ? undefined : tooltipLeft + band / 2 + 8,
            right: flip ? width - tooltipLeft + band / 2 + 8 : undefined,
            top: MARGIN.top,
          }}
          role="presentation"
        >
          <div className={styles.tooltipHead}>
            <span>{formatDayLabel(days[hovered], i18n.language)}</span>
            <strong>{formatUsd(totals[hovered])}</strong>
          </div>
          {window.isCurrent && hovered > window.todayIndex ? (
            <div className={styles.tooltipMuted}>{t('devices.chart_future')}</div>
          ) : totals[hovered] === 0 ? (
            <div className={styles.tooltipMuted}>{t('devices.chart_no_spend')}</div>
          ) : (
            <ul className={styles.tooltipList}>
              {series
                .filter((s) => s.values[hovered] > 0)
                .sort((a, b) => b.values[hovered] - a.values[hovered])
                .map((s) => {
                  const req = requests?.[s.key]?.[hovered];
                  return (
                    <li key={s.key}>
                      <span className={styles.swatch} style={{ background: seriesColor(s.slot) }} />
                      <span className={styles.tooltipName}>{s.name}</span>
                      {req ? (
                        <span className={styles.tooltipMuted}>
                          {t('devices.req_short', { count: req })}
                        </span>
                      ) : null}
                      <span className={styles.tooltipValue}>{formatUsd(s.values[hovered])}</span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Tiny single-series bar sparkline for list rows. */
export function Sparkline({
  values,
  todayIndex,
  color,
  label,
}: {
  values: number[];
  todayIndex: number;
  color: string;
  label: string;
}) {
  const w = 120;
  const h = 32;
  const max = Math.max(...values, 0);
  const band = values.length > 0 ? w / values.length : 0;
  const barW = Math.max(1.5, band * 0.62);
  return (
    <svg
      className={styles.sparkline}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} className={styles.axisBase} />
      {values.map((v, i) => {
        const future = todayIndex >= 0 && i > todayIndex;
        const bh = max > 0 ? Math.max(v > 0 ? 1.5 : 0, (v / max) * (h - 2)) : 0;
        return (
          <rect
            key={i}
            x={band * i + (band - barW) / 2}
            y={future ? h - 1.5 : h - 1 - bh}
            width={barW}
            height={future ? 1 : bh}
            rx={Math.min(1.5, barW / 2)}
            fill={future ? 'var(--border-color)' : color}
          />
        );
      })}
    </svg>
  );
}
