import { startTransition, useDeferredValue, useEffect, useEffectEvent, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { ActionButton } from '../components/ActionButton';
import { SectionCard } from '../components/SectionCard';
import { api } from '../lib/api';
import { SENSOR_METRICS, SENSOR_METRICS_BY_KEY } from '../lib/sensorMetrics';

const ANALYTICS_WINDOWS = [
  { value: '30m', label: '30 minutes', durationMs: 30 * 60 * 1000 },
  { value: '1h', label: '1 hour', durationMs: 60 * 60 * 1000 },
  { value: '2h', label: '2 hours', durationMs: 2 * 60 * 60 * 1000 },
  { value: '4h', label: '4 hours', durationMs: 4 * 60 * 60 * 1000 },
  { value: '1d', label: '1 day', durationMs: 24 * 60 * 60 * 1000 }
];

const THRESHOLD_STORAGE_KEY = 'smart-plant.analytics.thresholds.v1';
const REFRESH_INTERVAL_MS = 60 * 1000;

function formatMetricValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  return value >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function formatMetricWithUnit(value, unit = '') {
  const formattedValue = formatMetricValue(value);
  if (formattedValue === '--' || !unit) {
    return formattedValue;
  }

  return `${formattedValue} ${unit}`;
}

function formatTimestamp(value) {
  if (!value) {
    return 'Unavailable';
  }

  return new Date(value).toLocaleString();
}

function formatTrendTick(value) {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatTrendTooltipLabel(value) {
  return formatTimestamp(value);
}

function loadThresholds() {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(THRESHOLD_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const thresholds = {};

    for (const metric of SENSOR_METRICS) {
      const value = parsed[metric.key];
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }

      thresholds[metric.key] = {
        low: Number.isFinite(value.low) ? value.low : null,
        high: Number.isFinite(value.high) ? value.high : null
      };
    }

    return thresholds;
  } catch (_error) {
    return {};
  }
}

function getWindowConfig(windowValue) {
  return ANALYTICS_WINDOWS.find((option) => option.value === windowValue) || ANALYTICS_WINDOWS[0];
}

function buildAnalyticsQuery(windowValue) {
  const windowConfig = getWindowConfig(windowValue);
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - windowConfig.durationMs);

  return {
    limit: 300,
    sort: 'asc',
    from: fromDate.toISOString(),
    to: toDate.toISOString()
  };
}

function getThresholdBand(thresholdMap, metricKey) {
  const threshold = thresholdMap?.[metricKey];

  return {
    low: Number.isFinite(threshold?.low) ? threshold.low : null,
    high: Number.isFinite(threshold?.high) ? threshold.high : null
  };
}

function hasThresholdBand(threshold) {
  return Number.isFinite(threshold?.low) || Number.isFinite(threshold?.high);
}

function normalizeThresholdInput(rawValue) {
  if (rawValue === '') {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildMetricSeries(readings, metric, threshold) {
  let previousValue = null;

  return readings.map((reading) => {
    const rawValue = reading?.[metric.key];
    const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null;

    let isAnomaly = false;
    if (value !== null) {
      if (hasThresholdBand(threshold)) {
        if (Number.isFinite(threshold.low) && value < threshold.low) {
          isAnomaly = true;
        }

        if (Number.isFinite(threshold.high) && value > threshold.high) {
          isAnomaly = true;
        }
      } else if (previousValue !== null) {
        isAnomaly = Math.abs(value - previousValue) >= metric.fallbackSpikeDelta;
      }

      previousValue = value;
    }

    return {
      timestamp: reading.createdAt,
      value,
      isAnomaly
    };
  });
}

function summarizeSeries(series) {
  const populated = series.filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));

  if (populated.length === 0) {
    return {
      current: null,
      minimum: null,
      maximum: null,
      change: null,
      anomalyCount: 0
    };
  }

  const current = populated[populated.length - 1].value;
  const minimum = populated.reduce((lowest, point) => Math.min(lowest, point.value), populated[0].value);
  const maximum = populated.reduce((highest, point) => Math.max(highest, point.value), populated[0].value);
  const change = current - populated[0].value;
  const anomalyCount = populated.filter((point) => point.isAnomaly).length;

  return {
    current,
    minimum,
    maximum,
    change,
    anomalyCount
  };
}

function renderThresholdBand(threshold, color) {
  const elements = [];

  if (Number.isFinite(threshold.low) && Number.isFinite(threshold.high)) {
    elements.push(
      <ReferenceArea
        key="band"
        y1={threshold.low}
        y2={threshold.high}
        fill={color}
        fillOpacity={0.08}
      />
    );
  }

  if (Number.isFinite(threshold.low)) {
    elements.push(
      <ReferenceLine
        key="low"
        y={threshold.low}
        stroke={color}
        strokeDasharray="4 4"
        strokeOpacity={0.45}
      />
    );
  }

  if (Number.isFinite(threshold.high)) {
    elements.push(
      <ReferenceLine
        key="high"
        y={threshold.high}
        stroke={color}
        strokeDasharray="4 4"
        strokeOpacity={0.45}
      />
    );
  }

  return elements;
}

function TrendTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className="chart-tooltip">
      <strong>{formatTrendTooltipLabel(label)}</strong>
      <span>{metric.label}: {formatMetricWithUnit(point.value, metric.unit)}</span>
      <span>{point.isAnomaly ? 'Flagged anomaly' : 'Within range'}</span>
    </div>
  );
}

function AnomalyDot(props) {
  const { cx, cy, payload } = props;

  if (!payload?.isAnomaly || cx === undefined || cy === undefined) {
    return null;
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="#a6312a"
      stroke="#fff7ef"
      strokeWidth={1.5}
    />
  );
}

function TrendCard({ metric, series, summary, threshold, isActive, onFocus }) {
  const hasData = series.some((point) => typeof point.value === 'number' && Number.isFinite(point.value));

  return (
    <button
      type="button"
      className={`trend-card ${isActive ? 'trend-card--active' : ''}`}
      onClick={onFocus}
      aria-pressed={isActive}
    >
      <div className="trend-card__header">
        <div>
          <span className="trend-card__eyebrow">{metric.label}</span>
          <strong className="trend-card__value">{formatMetricWithUnit(summary.current, metric.unit)}</strong>
        </div>
        <div className="trend-card__meta">
          <span className={`trend-pill ${summary.anomalyCount > 0 ? 'trend-pill--alert' : 'trend-pill--quiet'}`}>
            {summary.anomalyCount} {summary.anomalyCount === 1 ? 'anomaly' : 'anomalies'}
          </span>
          <span className={`trend-pill ${hasThresholdBand(threshold) ? 'trend-pill--banded' : 'trend-pill--fallback'}`}>
            {hasThresholdBand(threshold) ? 'Threshold band' : 'Spike watch'}
          </span>
        </div>
      </div>

      <div className="trend-card__chart">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              {renderThresholdBand(threshold, metric.chartColor)}
              <Tooltip content={<TrendTooltip metric={metric} />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={metric.chartColor}
                strokeWidth={2.2}
                fill={metric.chartColor}
                fillOpacity={0.16}
                connectNulls
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="empty-state">No stored readings in this window.</p>
        )}
      </div>

      <div className="trend-card__stats">
        <span>Min {formatMetricValue(summary.minimum)}</span>
        <span>Max {formatMetricValue(summary.maximum)}</span>
        <span>{summary.change === null ? 'Δ --' : `Δ ${summary.change >= 0 ? '+' : ''}${formatMetricValue(summary.change)}`}</span>
      </div>
    </button>
  );
}

function AnalyticsPage() {
  const [windowValue, setWindowValue] = useState('4h');
  const [readings, setReadings] = useState([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [historySource, setHistorySource] = useState(null);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [activeMetricKey, setActiveMetricKey] = useState(SENSOR_METRICS[0].key);
  const [thresholds, setThresholds] = useState(() => loadThresholds());

  const deferredReadings = useDeferredValue(readings);
  const windowConfig = getWindowConfig(windowValue);
  const activeMetric = SENSOR_METRICS_BY_KEY[activeMetricKey] || SENSOR_METRICS[0];
  const activeThreshold = getThresholdBand(thresholds, activeMetric.key);
  const activeSeries = buildMetricSeries(deferredReadings, activeMetric, activeThreshold);
  const activeSummary = summarizeSeries(activeSeries);

  const refreshAnalytics = useEffectEvent(async ({ showBusy = false, notify = false } = {}) => {
    if (showBusy) {
      setIsRefreshing(true);
    }

    try {
      const payload = await api.getReadings(buildAnalyticsQuery(windowValue));

      startTransition(() => {
        setReadings(Array.isArray(payload.readings) ? payload.readings : []);
        setTotalMatched(Number.isFinite(payload.totalMatched) ? payload.totalMatched : 0);
        setHistorySource(typeof payload.source === 'string' ? payload.source : null);
        setAnalyticsError(typeof payload.error === 'string' ? payload.error : null);
        setLastUpdatedAt(new Date().toISOString());
      });

      if (notify) {
        toast.success('Analytics refreshed.');
      }
    } catch (error) {
      startTransition(() => {
        setReadings([]);
        setTotalMatched(0);
        setHistorySource(null);
        setAnalyticsError(error.message);
      });

      if (notify) {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
      if (showBusy) {
        setIsRefreshing(false);
      }
    }
  });

  useEffect(() => {
    setIsLoading(true);
    refreshAnalytics();
  }, [windowValue, refreshAnalytics]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshAnalytics();
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [windowValue, refreshAnalytics]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(thresholds));
  }, [thresholds]);

  function updateThreshold(metricKey, fieldName, rawValue) {
    const nextValue = normalizeThresholdInput(rawValue);

    setThresholds((current) => ({
      ...current,
      [metricKey]: {
        ...getThresholdBand(current, metricKey),
        [fieldName]: nextValue
      }
    }));
  }

  function resetThreshold(metricKey) {
    setThresholds((current) => ({
      ...current,
      [metricKey]: {
        low: null,
        high: null
      }
    }));
  }

  return (
    <main className="app-shell">
      <header className="hero-panel hero-panel--analytics">
        <div>
          <span className="hero-panel__eyebrow">Smart Plant Monitoring Console</span>
          <h1>Sensor Analytics</h1>
          <p>
            LogicMonitor-style trend cards for every dashboard sensor. The selected window uses saved finalized readings, so this page adds history without changing live monitoring behavior.
          </p>
        </div>

        <div className="hero-panel__status-cluster">
          <div className="status-chip status-chip--reachable">
            <span className="status-chip__dot" />
            Window · {windowConfig.label}
          </div>
          <div className={`status-chip ${analyticsError ? 'status-chip--offline' : 'status-chip--live'}`}>
            {analyticsError ? 'History Unavailable' : `${deferredReadings.length} points loaded`}
          </div>
          <div className="status-chip status-chip--idle">
            Updated · {formatTimestamp(lastUpdatedAt)}
          </div>
        </div>
      </header>

      <SectionCard
        title="Analytics Controls"
        eyebrow="Time window + refresh"
        actions={<span className="helper-copy">Range changes the visible history window: 30m, 1h, 2h, 4h, and 1d.</span>}
      >
        <div className="toolbar-cluster">
          {ANALYTICS_WINDOWS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`filter-pill ${option.value === windowValue ? 'filter-pill--active' : ''}`}
              onClick={() => setWindowValue(option.value)}
            >
              {option.label}
            </button>
          ))}

          <ActionButton
            tone="slate"
            busy={isRefreshing}
            onClick={() => refreshAnalytics({ showBusy: true, notify: true })}
          >
            Refresh Analytics
          </ActionButton>
        </div>

        <p className="helper-copy helper-copy--block">
          Showing {deferredReadings.length} plotted records out of {totalMatched} matched readings{historySource ? ` from ${historySource}` : ''}. One day fits within the current 300-reading API cap because saved batches arrive roughly every 5 minutes.
        </p>

        {analyticsError ? <p className="warning-text">Analytics unavailable: {analyticsError}</p> : null}
      </SectionCard>

      <section className="section-grid section-grid--two-up">
        <SectionCard
          title={`${activeMetric.label} Focus`}
          eyebrow="Detailed view"
          actions={<span className="helper-copy">Click any trend card below to change the focused metric.</span>}
        >
          <div className="analytics-summary-grid">
            <div>
              <span className="info-label">Current value</span>
              <strong>{formatMetricWithUnit(activeSummary.current, activeMetric.unit)}</strong>
            </div>
            <div>
              <span className="info-label">Minimum</span>
              <strong>{formatMetricWithUnit(activeSummary.minimum, activeMetric.unit)}</strong>
            </div>
            <div>
              <span className="info-label">Maximum</span>
              <strong>{formatMetricWithUnit(activeSummary.maximum, activeMetric.unit)}</strong>
            </div>
            <div>
              <span className="info-label">Anomalies</span>
              <strong>{activeSummary.anomalyCount}</strong>
            </div>
          </div>

          <div className="analytics-chart analytics-chart--focus">
            {activeSeries.some((point) => point.value !== null) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeSeries} margin={{ top: 12, right: 14, left: 10, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(16, 36, 25, 0.08)" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatTrendTick}
                    stroke="rgba(79, 99, 86, 0.8)"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={20}
                  />
                  <YAxis
                    stroke="rgba(79, 99, 86, 0.8)"
                    tickLine={false}
                    axisLine={false}
                    width={66}
                    tickMargin={8}
                    tickFormatter={(value) => formatMetricValue(value)}
                  />
                  {renderThresholdBand(activeThreshold, activeMetric.chartColor)}
                  <Tooltip content={<TrendTooltip metric={activeMetric} />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={activeMetric.chartColor}
                    strokeWidth={2.5}
                    fill={activeMetric.chartColor}
                    fillOpacity={0.14}
                    connectNulls
                    isAnimationActive={false}
                    dot={<AnomalyDot />}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="empty-state">No stored readings matched this window for the focused metric.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Threshold Band"
          eyebrow="Unique feature"
          actions={<span className="helper-copy">Bands persist in your browser and only affect analytics highlighting.</span>}
        >
          <div className="form-grid threshold-grid">
            <label>
              Focus metric
              <select value={activeMetric.key} onChange={(event) => setActiveMetricKey(event.target.value)}>
                {SENSOR_METRICS.map((metric) => (
                  <option key={metric.key} value={metric.key}>{metric.label}</option>
                ))}
              </select>
            </label>

            <label>
              Lower threshold ({activeMetric.unit || 'value'})
              <input
                type="number"
                step="any"
                value={activeThreshold.low ?? ''}
                onChange={(event) => updateThreshold(activeMetric.key, 'low', event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label>
              Upper threshold ({activeMetric.unit || 'value'})
              <input
                type="number"
                step="any"
                value={activeThreshold.high ?? ''}
                onChange={(event) => updateThreshold(activeMetric.key, 'high', event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="control-cluster control-cluster--compact threshold-actions">
            <ActionButton tone="slate" onClick={() => resetThreshold(activeMetric.key)}>Reset Band</ActionButton>
          </div>

          <p className="warning-text">
            {hasThresholdBand(activeThreshold)
              ? 'Values outside the configured band are highlighted as anomalies.'
              : `No band configured. Analytics falls back to spike detection when ${activeMetric.label} changes by at least ${activeMetric.fallbackSpikeDelta}${activeMetric.unit ? ` ${activeMetric.unit}` : ''} between stored points.`}
          </p>
        </SectionCard>
      </section>

      <SectionCard
        title="All Sensor Trends"
        eyebrow="LogicMonitor-style small multiples"
        actions={<span className="helper-copy">Every current dashboard sensor is graphed here using the selected history window.</span>}
      >
        <div className="analytics-card-grid">
          {SENSOR_METRICS.map((metric) => {
            const threshold = getThresholdBand(thresholds, metric.key);
            const series = buildMetricSeries(deferredReadings, metric, threshold);
            const summary = summarizeSeries(series);

            return (
              <TrendCard
                key={metric.key}
                metric={metric}
                series={series}
                summary={summary}
                threshold={threshold}
                isActive={metric.key === activeMetric.key}
                onFocus={() => setActiveMetricKey(metric.key)}
              />
            );
          })}
        </div>
      </SectionCard>

      {isLoading ? <div className="loading-banner">Loading analytics history...</div> : null}
    </main>
  );
}

export default AnalyticsPage;