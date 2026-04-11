import 'uplot/dist/uPlot.min.css';
import uPlot from 'uplot';

type ChartData = {
  timestamps: number[];
  responseTimes: number[];
  statuses: string[];
};

// Cache for computed CSS variables to avoid layout thrashing
const cssVarCache = new Map<string, string>();

function getComputedCssVar(name: string): string {
  if (cssVarCache.has(name)) {
    return cssVarCache.get(name)!;
  }

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  cssVarCache.set(name, value);
  return value;
}

// Clear cache on theme change to get updated values
function clearCssVarCache(): void {
  cssVarCache.clear();
}

// Listen for theme changes to clear cache
if (typeof window !== 'undefined') {
  // Check if theme attribute changes
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

// 24h time formatters for X-axis at different granularities
const formatAxisHourMinute = uPlot.fmtDate('{HH}:{mm}');
const fmtAxisDate = uPlot.fmtDate('{M}/{D}');

function fmtAxisValues(_u: uPlot, splits: number[], _ax: number, _space: number, incr: number) {
  const oneHour = 3600;
  const oneDay = 86_400;

  return splits.map(v => {
    if (v === undefined || v === null) {
      return '';
    }

    const d = new Date(v * 1000);
    if (incr >= oneDay) {
      return fmtAxisDate(d);
    }

    if (incr >= oneHour) {
      return formatAxisHourMinute(d);
    }

    return formatAxisHourMinute(d);
  });
}

function tooltipPlugin(strokeColor: string): uPlot.Plugin {
  let tooltipElement: HTMLDivElement;
  let over: HTMLElement;

  return {
    hooks: {
      init: [
        (u: uPlot) => {
          over = u.over;
          tooltipElement = document.createElement('div');
          tooltipElement.className = 'chart-tooltip';
          tooltipElement.style.cssText = `
            position: absolute;
            pointer-events: none;
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid ${strokeColor};
            color: #e2e8f0;
            padding: 4px 8px;
            border-radius: 4px;
            font: 500 10px 'Geist Mono', monospace;
            display: none;
            white-space: nowrap;
            z-index: 10;
          `;
          // Cast needed: @cloudflare/workers-types overrides DOM append() signature
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

          // Position tooltip, flipping side if near right edge
          const tipWidth = tooltipElement.offsetWidth;
          const plotWidth = over.clientWidth;
          const shiftX = 12;
          const shiftY = -10;
          let posLeft = left + shiftX;
          if (posLeft + tipWidth > plotWidth) {
            posLeft = left - tipWidth - shiftX;
          }

          tooltipElement.style.left = posLeft + 'px';
          tooltipElement.style.top = (top ?? 0) + shiftY + 'px';
        },
      ],
    },
  };
}

function createChart(container: HTMLElement): void {
  // Remove loading state if present
  const loadingEl = container.querySelector('.chart-loading');
  if (loadingEl) {
    loadingEl.remove();
  }

  const scriptTag = container.querySelector('script[type="application/json"]');
  if (!scriptTag?.textContent) {
    return;
  }

  let data: ChartData;
  try {
    data = JSON.parse(scriptTag.textContent) as ChartData;
  } catch {
    return;
  }

  if (data.timestamps.length === 0) {
    container.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:11px;">No data available</div>';
    return;
  }

  const upColor = getComputedCssVar('--up') || '#10b981';
  const downColor = getComputedCssVar('--down') || '#ef4444';
  const textDim = getComputedCssVar('--text-dim') || '#475569';

  // Determine line color based on current monitor status
  const monitorCard = container.closest('.monitor-card');
  const isDown = monitorCard?.classList.contains('status-down');
  const strokeColor = isDown ? downColor : upColor;
  const fillColorRgba = isDown ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)';
  const downtimeBandColor = 'rgba(239, 68, 68, 0.08)';

  // Build downtime bands for the draw hook
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
        grid: { show: true, stroke: 'rgba(255, 255, 255, 0.04)', width: 1 },
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
        fill: fillColorRgba,
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

  // Build uPlot data format: [timestamps, values]
  // Replace response times for down status with undefined (gaps)
  const values: Array<number | undefined> = data.responseTimes.map((rt, i) =>
    data.statuses[i] === 'up' ? rt : undefined
  );

  const plotData: uPlot.AlignedData = [data.timestamps, values];

  // Clear container and create chart
  container.textContent = '';

  const plot = new uPlot(options, plotData, container);

  // Double-click to reset zoom
  plot.over.addEventListener('dblclick', () => {
    plot.setScale('x', {
      min: data.timestamps[0],
      max: data.timestamps.at(-1)!,
    });
  });

  // Resize observer
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width } = entry.contentRect;
      if (width > 0) {
        plot.setSize({ width, height: entry.contentRect.height || 120 });
      }
    }
  });

  observer.observe(container);
}

// Initialize charts lazily when they enter viewport
function initCharts(): void {
  const containers = document.querySelectorAll<HTMLElement>('.chart-container');

  // Add loading state to all chart containers
  containers.forEach(container => {
    if (!container.querySelector('.chart-loading')) {
      const loadingEl = document.createElement('div');
      loadingEl.className = 'chart-loading';
      loadingEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;">
          <div class="chart-loading-spinner"></div>
        </div>
      `;
      container.appendChild(loadingEl);
    }
  });

  // Use IntersectionObserver to lazy load charts
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
    {
      rootMargin: '100px', // Start loading 100px before entering viewport
      threshold: 0.1, // Trigger when at least 10% visible
    }
  );

  // Observe all chart containers
  containers.forEach(container => {
    observer.observe(container);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCharts);
} else {
  initCharts();
}
