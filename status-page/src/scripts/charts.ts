import 'uplot/dist/uPlot.min.css';
import uPlot from 'uplot';

type ChartData = {
  name: string;
  timestamps: number[];
  responseTimes: number[];
  statuses: string[];
};

type Band = [number, number];

type ActiveChart = {
  plot: uPlot;
  observer: ResizeObserver;
};

const chartData = new WeakMap<HTMLElement, ChartData>();
const activeCharts = new Map<HTMLElement, ActiveChart>();
const renderedCharts = new Set<HTMLElement>();

const cssVarCache = new Map<string, string>();

function getCssVar(name: string, fallback: string): string {
  if (cssVarCache.has(name)) return cssVarCache.get(name)!;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const result = value || fallback;
  cssVarCache.set(name, result);
  return result;
}

function clearCssVarCache(): void {
  cssVarCache.clear();
}

if (typeof window !== 'undefined') {
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
        clearCssVarCache();
      }
    }
  });
  observer.observe(document.documentElement, { attributes: true });
}

const axisTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const axisDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  month: 'numeric',
  day: 'numeric',
});

function fmtAxisHourMinute(value: number): string {
  return axisTime.format(new Date(value * 1000));
}

function fmtAxisDate(value: number): string {
  return axisDate.format(new Date(value * 1000));
}

function fmtAxisValues(
  _u: uPlot,
  splits: number[],
  _ax: number,
  _space: number,
  incr: number,
  max?: number
) {
  const oneHour = 3600;
  const oneDay = 86_400;
  return splits.map(value => {
    if (value == null) return '';
    if (max != null && value > max - 7200) return '';
    if (incr >= oneDay) return fmtAxisDate(value);
    if (incr >= oneHour) return fmtAxisHourMinute(value);
    return fmtAxisHourMinute(value);
  });
}

const statusLabels: Record<string, string> = {
  up: 'Operational',
  down: 'Down',
  maintenance: 'Maintenance',
};

function buildBands(data: ChartData): { down: Band[]; maintenance: Band[] } {
  const bands: { down: Band[]; maintenance: Band[] } = { down: [], maintenance: [] };
  const total = data.timestamps.length;
  if (total === 0) return bands;

  let kind: 'down' | 'maintenance' | null = null;
  let start = 0;

  for (let index = 0; index < total; index++) {
    const status = data.statuses[index];
    const next: 'down' | 'maintenance' | null =
      status === 'down' ? 'down' : status === 'maintenance' ? 'maintenance' : null;

    if (next !== kind) {
      if (kind) {
        bands[kind].push([start, data.timestamps[index] ?? data.timestamps[total - 1]]);
      }
      kind = next;
      start = data.timestamps[index];
    }
  }

  if (kind) bands[kind].push([start, data.timestamps[total - 1]]);
  return bands;
}

function paintBands(
  u: uPlot,
  bands: { down: Band[]; maintenance: Band[] },
  colors: { down: string; maintenance: string; downLabel: string; maintenanceLabel: string }
): void {
  if (!u.bbox) return;
  const { ctx } = u;
  const top = u.bbox.top;
  const height = u.bbox.height;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';

  for (const [start, end] of bands.maintenance) {
    const x0 = u.valToPos(start, 'x', true) + 3;
    const x1 = u.valToPos(end, 'x', true);
    ctx.fillStyle = colors.maintenance;
    ctx.fillRect(x0, top, Math.max(1, x1 - x0), height);
  }

  for (const [start, end] of bands.down) {
    const x0 = u.valToPos(start, 'x', true) + 3;
    const x1 = u.valToPos(end, 'x', true);
    ctx.fillStyle = colors.down;
    ctx.fillRect(x0, top, Math.max(1, x1 - x0), height);
  }

  ctx.restore();

  ctx.save();
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.textBaseline = 'top';

  const labelBand = (start: number, color: string, prefix: string): void => {
    const x = u.valToPos(start, 'x', true) + 3;
    const edge = u.bbox!.left + u.bbox!.width;
    const text = `${prefix} ${fmtAxisHourMinute(start)}`;
    const width = ctx.measureText(text).width;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + height);
    ctx.stroke();

    ctx.fillStyle = color;
    if (x + width + 6 > edge) {
      ctx.textAlign = 'right';
      ctx.fillText(text, x - 4, top + 4);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(text, x + 4, top + 4);
    }
  };

  for (const [start] of bands.maintenance) {
    labelBand(start, colors.maintenanceLabel, 'MAINT');
  }

  for (const [start] of bands.down) {
    labelBand(start, colors.downLabel, 'OUTAGE');
  }

  ctx.restore();
}

function drawNow(u: uPlot, timestamp: number, color: string): void {
  if (!u.bbox) return;
  const x = u.valToPos(timestamp, 'x', true);
  const { ctx } = u;
  ctx.save();
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('NOW', x, u.bbox.top + u.bbox.height + 17);
  ctx.restore();
}

function createChart(container: HTMLElement): void {
  const scriptTag = container.querySelector<HTMLScriptElement>('script[type="application/json"]');

  let data = chartData.get(container);
  if (!data) {
    if (!scriptTag?.textContent) return;
    try {
      data = JSON.parse(scriptTag.textContent) as ChartData;
      chartData.set(container, data);
    } catch {
      return;
    }
  }

  container.querySelector('.chart-skeleton')?.remove();
  const previous = activeCharts.get(container);
  if (previous) {
    previous.observer.disconnect();
    previous.plot.destroy();
    activeCharts.delete(container);
  }
  container.textContent = '';

  if (data.timestamps.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'chart-empty';
    empty.textContent = 'No checks recorded in the last 24 hours.';
    container.appendChild(empty);
    return;
  }

  const up = getCssVar('--up', '#2f7a5b');
  const down = getCssVar('--down', '#c0392b');
  const maintenance = getCssVar('--maint', '#a86a12');
  const ink3 = getCssVar('--ink-3', '#5a6b77');
  const grid = getCssVar('--chart-grid', '#c2d2dc');
  const surface = getCssVar('--chart-surface', '#f2f7f9');
  const downBand = getCssVar('--chart-band-down', 'rgba(192, 57, 43, 0.08)');
  const maintBand = getCssVar('--chart-band-maint', 'rgba(168, 106, 18, 0.09)');

  const chart = data;
  const bands = buildBands(chart);

  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('aria-hidden', 'true');

  const options: uPlot.Options = {
    width: container.clientWidth,
    height: container.clientHeight || 170,
    legend: { show: false },
    cursor: {
      show: true,
      x: true,
      y: false,
      points: { show: true, size: 5, width: 2, stroke: surface, fill: up },
    },
    scales: {
      x: {
        time: true,
        range: () => [chart.timestamps[0], chart.timestamps[chart.timestamps.length - 1]],
      },
      y: {
        range: (_u, _min, max) => [0, Number.isFinite(max) ? Math.max(max * 1.2, 20) : 20],
      },
    },
    axes: [
      {
        stroke: ink3,
        font: '11px "JetBrains Mono", monospace',
        size: 30,
        gap: 4,
        ticks: { show: false },
        grid: { show: false },
        values: (u, splits, ax, space, incr) =>
          fmtAxisValues(u, splits, ax, space, incr, chart.timestamps[chart.timestamps.length - 1]),
      },
      {
        stroke: ink3,
        font: '11px "JetBrains Mono", monospace',
        size: 52,
        gap: 6,
        ticks: { show: false },
        grid: { show: true, stroke: grid, width: 1, dash: [2, 4] },
        values: (_u, splits) =>
          splits.map(value => (value == null ? '' : `${Math.round(value)} ms`)),
      },
    ],
    series: [
      {},
      {
        label: 'Response time',
        stroke: up,
        width: 1.5,
        spanGaps: false,
      },
    ],
    hooks: {
      draw: [
        (u: uPlot) => {
          paintBands(u, bands, {
            down: downBand,
            maintenance: maintBand,
            downLabel: down,
            maintenanceLabel: maintenance,
          });
          drawNow(u, chart.timestamps[chart.timestamps.length - 1], ink3);
        },
      ],
      setCursor: [
        (u: uPlot) => {
          const { left, top, idx } = u.cursor;
          if (idx == null || left == null || left < 0 || !chart) {
            tip.style.display = 'none';
            return;
          }

          const timestamp = chart.timestamps[idx];
          if (timestamp == null) {
            tip.style.display = 'none';
            return;
          }

          const status = chart.statuses[idx] ?? 'down';
          const response = chart.responseTimes[idx];
          const value =
            status === 'up'
              ? `${Math.round(response)} ms`
              : status === 'maintenance'
                ? 'Alerts suppressed'
                : 'No response';

          tip.textContent = `${fmtAxisHourMinute(timestamp)} UTC · ${
            statusLabels[status] ?? 'Down'
          } · ${value}`;
          tip.style.display = 'block';

          const tipWidth = tip.offsetWidth;
          const tipHeight = tip.offsetHeight;
          const plotWidth = container.clientWidth;
          const plotHeight = container.clientHeight;
          const shift = 12;

          let x: number;
          if (left + shift + tipWidth <= plotWidth) x = left + shift;
          else if (left - shift - tipWidth >= 0) x = left - shift - tipWidth;
          else x = Math.max(0, Math.min(left, plotWidth - tipWidth));

          let y = (top ?? 0) - tipHeight - 10;
          if (y < 0) y = (top ?? 0) + 16;
          if (y + tipHeight > plotHeight) y = Math.max(0, plotHeight - tipHeight);

          tip.style.left = `${x}px`;
          tip.style.top = `${y}px`;
        },
      ],
    },
  };

  const values: Array<number | undefined> = chart.responseTimes.map((response, index) =>
    chart.statuses[index] === 'up' ? response : undefined
  );

  const plotData: uPlot.AlignedData = [chart.timestamps, values];
  const plot = new uPlot(options, plotData, container);
  container.appendChild(tip);

  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0) plot.setSize({ width, height: height || 170 });
    }
  });
  resizeObserver.observe(container);

  activeCharts.set(container, { plot, observer: resizeObserver });
  renderedCharts.add(container);

  container.addEventListener('mouseleave', () => {
    tip.style.display = 'none';
  });
}

function initCharts(): void {
  const containers = Array.from(document.querySelectorAll<HTMLElement>('[data-chart]'));
  containers.forEach(container => createChart(container));
}

function hideUptimeTip(tip: HTMLElement): void {
  tip.hidden = true;
}

function showUptimeTip(figure: HTMLElement, tip: HTMLElement, bar: HTMLElement): void {
  const date = bar.dataset.date;
  if (!date) return;

  const value = bar.dataset.value;
  const state = bar.dataset.state ?? 'no-data';
  const stateLabel =
    state === 'no-data'
      ? 'No data'
      : state === 'down'
        ? 'Down'
        : state === 'degraded'
          ? 'Degraded'
          : 'Operational';

  const parsed = new Date(`${date}T12:00:00Z`);
  const dateLabel = Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('en-GB', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

  tip.textContent = `${dateLabel} · ${value ? `${value}%` : 'No data'} · ${stateLabel}`;
  tip.hidden = false;

  const figureRect = figure.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  const half = tip.offsetWidth / 2;
  let left = barRect.left - figureRect.left + barRect.width / 2;
  left = Math.min(Math.max(left, half + 2), figureRect.width - half - 2);

  tip.style.left = `${left}px`;
  tip.style.top = `${barRect.top - figureRect.top - 8}px`;
}

function initUptimeHistories(): void {
  document.querySelectorAll<HTMLElement>('[data-uptime]').forEach(strip => {
    const figure = strip.closest('figure');
    const tip = figure?.querySelector<HTMLElement>('.uptime-tip');
    if (!figure || !tip) return;

    const findBar = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      return target.closest<HTMLElement>('[data-date]');
    };

    strip.addEventListener('pointermove', event => {
      const bar = findBar(event.target);
      if (bar) showUptimeTip(figure, tip, bar);
      else hideUptimeTip(tip);
    });

    strip.addEventListener('pointerdown', event => {
      const bar = findBar(event.target);
      if (bar) showUptimeTip(figure, tip, bar);
    });

    strip.addEventListener('pointerleave', () => hideUptimeTip(tip));
    strip.addEventListener('pointercancel', () => hideUptimeTip(tip));

    const bars = Array.from(strip.querySelectorAll<HTMLElement>('[data-date]'));
    let current = bars.length - 1;

    const showAt = (index: number): void => {
      current = Math.max(0, Math.min(bars.length - 1, index));
      const bar = bars[current];
      if (bar) showUptimeTip(figure, tip, bar);
    };

    strip.addEventListener('focus', () => showAt(current));
    strip.addEventListener('blur', () => hideUptimeTip(tip));
    strip.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        hideUptimeTip(tip);
        strip.blur();
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') showAt(0);
      else if (event.key === 'End') showAt(bars.length - 1);
      else showAt(current + (event.key === 'ArrowRight' ? 1 : -1));
    });
  });
}

function rebuildCharts(): void {
  clearCssVarCache();
  for (const container of renderedCharts) {
    createChart(container);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    initUptimeHistories();
  });
} else {
  initCharts();
  initUptimeHistories();
}

document.addEventListener('atalaya:theme', rebuildCharts);
