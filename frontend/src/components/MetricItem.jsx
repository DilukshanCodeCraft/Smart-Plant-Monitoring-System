export function MetricItem({ label, value, unit = '', accent = 'sage' }) {
  return (
    <div className={`metric-item metric-item--${accent}`}>
      <span className="metric-item__label">{label}</span>
      <strong className="metric-item__value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </strong>
    </div>
  );
}
