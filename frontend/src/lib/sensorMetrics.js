export const SENSOR_METRICS = [
  {
    key: 'rootTempC',
    label: 'Root Temp',
    unit: '°C',
    accent: 'sage',
    chartColor: '#5e7f4c',
    tableLabel: 'Root °C',
    fallbackSpikeDelta: 1.5
  },
  {
    key: 'airTempC',
    label: 'Air Temp',
    unit: '°C',
    accent: 'sun',
    chartColor: '#d8932f',
    tableLabel: 'Air °C',
    fallbackSpikeDelta: 1.5
  },
  {
    key: 'humidity',
    label: 'Humidity',
    unit: '%',
    accent: 'sky',
    chartColor: '#437f98',
    tableLabel: 'Humidity %',
    fallbackSpikeDelta: 8
  },
  {
    key: 'lux',
    label: 'Light',
    unit: 'lx',
    accent: 'amber',
    chartColor: '#b75f23',
    tableLabel: 'Light lx',
    fallbackSpikeDelta: 150
  },
  {
    key: 'soilPercent',
    label: 'Soil Moisture',
    unit: '%',
    accent: 'mint',
    chartColor: '#2f8a62',
    tableLabel: 'Soil %',
    fallbackSpikeDelta: 6
  },
  {
    key: 'mqRatio',
    label: 'Gas Ratio',
    unit: '',
    accent: 'sky',
    chartColor: '#4d90ab',
    tableLabel: 'Gas Ratio',
    fallbackSpikeDelta: 0.25
  },
  {
    key: 'mqPPM',
    label: 'Gas PPM',
    unit: 'ppm',
    accent: 'amber',
    chartColor: '#cd7a2f',
    tableLabel: 'MQ PPM',
    fallbackSpikeDelta: 40
  },
  {
    key: 'weightG',
    label: 'Weight',
    unit: 'g',
    accent: 'sage',
    chartColor: '#6b8c58',
    tableLabel: 'Weight g',
    fallbackSpikeDelta: 15
  },
  {
    key: 'weightError',
    label: 'Weight Error',
    unit: 'g',
    accent: 'mint',
    chartColor: '#3ca875',
    tableLabel: 'Weight Error g',
    fallbackSpikeDelta: 5
  },
  {
    key: 'vpd',
    label: 'VPD',
    unit: 'kPa',
    accent: 'sky',
    chartColor: '#437f98',
    tableLabel: 'VPD kPa',
    fallbackSpikeDelta: 0.1
  },
  {
    key: 'tempDifferential',
    label: 'Temp Diff',
    unit: '°C',
    accent: 'amber',
    chartColor: '#cd7a2f',
    tableLabel: 'Air-Root Δ',
    fallbackSpikeDelta: 1
  }
];

export const SENSOR_METRICS_BY_KEY = Object.fromEntries(
  SENSOR_METRICS.map((metric) => [metric.key, metric])
);

const readingTableKeys = new Set([
  'rootTempC',
  'airTempC',
  'humidity',
  'lux',
  'soilPercent',
  'mqRatio',
  'mqPPM',
  'weightG',
  'weightError',
  'vpd',
  'tempDifferential'
]);

export const READING_TABLE_COLUMNS = SENSOR_METRICS
  .filter((metric) => readingTableKeys.has(metric.key))
  .map((metric) => ({
    key: metric.key,
    label: metric.tableLabel
  }));