export function SectionCard({ title, eyebrow, children, actions, className = '' }) {
  return (
    <section className={`section-card ${className}`.trim()}>
      <header className="section-card__header">
        <div>
          {eyebrow ? <span className="section-card__eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
        </div>
        {actions ? <div className="section-card__actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
