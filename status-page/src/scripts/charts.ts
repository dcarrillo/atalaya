import 'uplot/dist/uPlot.min.css';
import uPlot from 'uplot';

type ChartData = {
  timestamps: number[];
  responseTimes: number[];
  statuses: string[];
};

const cssVarCache = new Map<string, string>();

function getCssVar(name: string): string {
  if (cssVarCache.has(name)) return cssVarCache.get(name)!;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  cssVarCache.set(name, value);
  return value;
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

const fmtTime = uPlot.fmtDate('{HH}:{mm}:{ss}');
const formatAxisHourMinute = uPlot.fmtDate('{HH}:{mm}');
const fmtAxisDate = uPlot.fmtDate('{M}/{D}');

function fmtAxisValues(_u: uPlot, splits: number[], _ax: number, _space: number, incr: number) {
  const oneHour = 3600;
  const oneDay = 86_400;
  return splits.map(v => {
    if (v === undefined || v === null) return '';
    const d = new Date(v * 1000);
    if (incr >= oneDay) return fmtAxisDate(d);
    if (incr >= oneHour) return formatAxisHourMinute(d);
    return formatAxisHourMinute(d);
  });
}

function tooltipPlugin(_strokeColor: string): uPlot.Plugin {
  let tooltipElement: HTMLDivElement;
  let over: HTMLElement;
  return {
    hooks: {
      init: [
        (u: uPlot) => {
          over = u.over;
          const textColor = getCssVar('--color-ink') || '#e2e8f0';
          const surface = getCssVar('--color-paper') || '#0f172a';

          tooltipElement = document.createElement('div');
          tooltipElement.className = 'chart-tooltip';
          tooltipElement.style.cssText = [
            'position: absolute',
            'pointer-events: none',
            `background: ${surface}`,
            `color: ${textColor}`,
            `border: 1px solid ${getCssVar('--color-rule') || 'rgb(51 65 85 / 0.6)'}`,
            'padding: 4px 8px',
            'border-radius: 4px',
            'font: 500 10px var(--font-mono, monospace)',
            'display: none',
            'white-space: nowrap',
            'z-index: 10',
          ].join(';');

          (over as ParentNode).append(tooltipElement);
          over.addEventListener('mouseenter', () => {
            tooltipElement.style.display = 'block';
          });
          over.addEventListener('mouseleave', () => {
            tooltipElement.style.display = 'none';
          });
        },
      ],
      setCursor: [
        (u: uPlot) => {
          const { left, top, idx } = u.cursor;
          if (
            idx === null ||
            idx === undefined ||
            left === null ||
            left === undefined ||
            left < 0
          ) {
            tooltipElement.style.display = 'none';
            return;
          }
          const xValue = u.data[0][idx];
          const yValue = u.data[1][idx];
          if (yValue === null || yValue === undefined) {
            tooltipElement.style.display = 'none';
            return;
          }
          tooltipElement.style.display = 'block';
          const timeString = fmtTime(new Date(xValue * 1000));
          const msString = Math.round(yValue) + ' ms';
          tooltipElement.textContent = `${timeString}  ${msString}`;

          const tipWidth = tooltipElement.offsetWidth;
          const tipHeight = tooltipElement.offsetHeight;
          const plotWidth = over.clientWidth;
          const plotHeight = over.clientHeight;
          const shiftX = 12;
          const shiftY = -10;

          let posLeft: number;
          const spaceRight = plotWidth - (left + shiftX);
          const spaceLeft = left - shiftX;
          if (spaceRight >= tipWidth) {
            posLeft = left + shiftX;
          } else if (spaceLeft >= tipWidth) {
            posLeft = left - tipWidth - shiftX;
          } else if (spaceRight > spaceLeft) {
            posLeft = plotWidth - tipWidth;
          } else {
            posLeft = 0;
          }
          posLeft = Math.max(0, Math.min(posLeft, plotWidth - tipWidth));

          let posTop = (top ?? 0) + shiftY;
          if (posTop < 0) posTop = 0;
          else if (posTop + tipHeight > plotHeight) posTop = plotHeight - tipHeight;

          tooltipElement.style.left = posLeft + 'px';
          tooltipElement.style.top = posTop + 'px';
        },
      ],
    },
  };
}

function createChart(container: HTMLElement): void {
  const loadingEl = container.querySelector('.chart-loading');
  if (loadingEl) loadingEl.remove();

  const scriptTag = container.querySelector('script[type="application/json"]');
  if (!scriptTag?.textContent) return;

  let data: ChartData;
  try {
    data = JSON.parse(scriptTag.textContent) as ChartData;
  } catch {
    return;
  }

  if (data.timestamps.length === 0) {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-ink-2);font-size:11px;">No data available</div>`;
    return;
  }

  const upColor = getCssVar('--color-up') || '#10b981';
  const downColor = getCssVar('--color-down') || '#ef4444';
  const textDim = getCssVar('--color-ink-3') || '#475569';
  const chartBgInset = getCssVar('--color-paper-3') || 'rgba(30, 41, 59, 0.3)';

  const monitorCard = container.closest('.monitor-card');
  const isDown = monitorCard?.classList.contains('status-down');
  const strokeColor = isDown ? downColor : upColor;

  // Derive fill and band colors from the stroke color via CSS — fall back to rgba from the OKLCH token name
  const fillColor = isDown
    ? getCssVar('--color-down-bg') || 'rgba(239, 68, 68, 0.1)'
    : getCssVar('--color-up-bg') || 'rgba(16, 185, 129, 0.1)';
  const downtimeBandColor = getCssVar('--color-down-bg') || 'rgba(239, 68, 68, 0.06)';

  const downtimeBands: Array<[number, number]> = [];
  let bandStart: number | undefined;
  for (let i = 0; i < data.statuses.length; i++) {
    if (data.statuses[i] === 'down') {
      bandStart ??= data.timestamps[i];
    } else if (bandStart !== undefined) {
      downtimeBands.push([bandStart, data.timestamps[i]]);
      bandStart = undefined;
    }
  }
  if (bandStart !== undefined) {
    downtimeBands.push([bandStart, data.timestamps.at(-1)!]);
  }

  const options: uPlot.Options = {
    width: container.clientWidth,
    height: container.clientHeight || 120,
    cursor: {
      show: true,
      points: { show: true, size: 6, fill: strokeColor },
    },
    legend: { show: false },
    plugins: [tooltipPlugin(strokeColor)],
    scales: {
      x: { time: true },
      y: { auto: true, range: (_u, _min, max) => [0, Math.max(max * 1.1, 100)] },
    },
    axes: [
      {
        show: true,
        stroke: textDim,
        font: '10px Geist Mono, monospace',
        size: 24,
        space: 60,
        gap: 2,
        ticks: { show: false },
        grid: { show: false },
        values: fmtAxisValues,
      },
      {
        show: true,
        stroke: textDim,
        font: '10px Geist Mono, monospace',
        size: 42,
        gap: 4,
        ticks: { show: false },
        grid: { show: true, stroke: chartBgInset, width: 1 },
        values: (_u: uPlot, splits: number[]) =>
          splits.map(v => (v === undefined || v === null ? '' : Math.round(v) + ' ms')),
      },
    ],
    series: [
      {},
      {
        label: 'Response Time',
        stroke: strokeColor,
        width: 1.5,
        fill: fillColor,
        spanGaps: false,
      },
    ],
    hooks: {
      draw: [
        (u: uPlot) => {
          const { ctx } = u;
          ctx.save();
          ctx.fillStyle = downtimeBandColor;
          for (const [start, end] of downtimeBands) {
            const x0 = u.valToPos(start, 'x', true);
            const x1 = u.valToPos(end, 'x', true);
            ctx.fillRect(x0, u.bbox.top, x1 - x0, u.bbox.height);
          }
          ctx.restore();
        },
      ],
    },
  };

  const values: Array<number | undefined> = data.responseTimes.map((rt, i) =>
    data.statuses[i] === 'up' ? rt : undefined
  );
  const plotData: uPlot.AlignedData = [data.timestamps, values];
  container.textContent = '';
  const plot = new uPlot(options, plotData, container);

  plot.over.addEventListener('dblclick', () => {
    plot.setScale('x', {
      min: data.timestamps[0],
      max: data.timestamps.at(-1)!,
    });
  });

  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width } = entry.contentRect;
      if (width > 0) {
        plot.setSize({ width, height: entry.contentRect.height || 120 });
      }
    }
  });
  resizeObserver.observe(container);
}

function initCharts(): void {
  const containers = document.querySelectorAll<HTMLElement>('.chart-container');
  containers.forEach(container => {
    if (!container.querySelector('.chart-loading')) {
      const loadingEl = document.createElement('div');
      loadingEl.className = 'chart-loading';
      loadingEl.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><div class="chart-loading-spinner"></div></div>';
      container.appendChild(loadingEl);
    }
  });

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const container = entry.target as HTMLElement;
          createChart(container);
          observer.unobserve(container);
        }
      });
    },
    { rootMargin: '100px', threshold: 0.1 }
  );

  containers.forEach(container => observer.observe(container));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCharts);
} else {
  initCharts();
}
