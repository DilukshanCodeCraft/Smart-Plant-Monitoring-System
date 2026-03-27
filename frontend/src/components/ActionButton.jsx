export function ActionButton({ children, onClick, tone = 'neutral', disabled = false, busy = false }) {
  return (
    <button
      type="button"
      className={`action-button action-button--${tone}`}
      onClick={onClick}
      disabled={disabled || busy}
    >
      <span>{busy ? 'Working...' : children}</span>
    </button>
  );
}
