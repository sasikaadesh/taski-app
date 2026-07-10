// GlassAurora — curated library hero: aurora gradient glows behind a backdrop-blur glass panel, CSS-only motion

export default function GlassAurora({ data }) {
  const { eyebrow, title, subtitle, ctas = [] } = data || {};

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 py-24">
      <style>{`
        @keyframes ga-rise {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ga-drift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50%      { transform: translate3d(4%, -6%, 0) scale(1.12); }
        }
        @keyframes ga-drift-alt {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1.08); }
          50%      { transform: translate3d(-5%, 5%, 0) scale(1); }
        }
      `}</style>

      <div aria-hidden="true" className="absolute inset-0">
        <div
          className="absolute -left-1/4 -top-1/4 h-2/3 w-2/3 rounded-full bg-primary/30 blur-3xl"
          style={{ animation: 'ga-drift 16s ease-in-out infinite' }}
        />
        <div
          className="absolute -bottom-1/4 -right-1/4 h-2/3 w-2/3 rounded-full bg-accent/25 blur-3xl"
          style={{ animation: 'ga-drift-alt 20s ease-in-out infinite' }}
        />
        <div
          className="absolute left-1/3 top-1/2 h-1/2 w-1/3 rounded-full bg-primary/15 blur-3xl"
          style={{ animation: 'ga-drift 24s ease-in-out infinite reverse' }}
        />
      </div>

      <div
        className="relative w-full max-w-3xl rounded-3xl border border-text/10 bg-surface/40 px-8 py-16 text-center shadow-2xl backdrop-blur-xl md:px-16"
        style={{ animation: 'ga-rise 0.9s ease-out both' }}
      >
        {eyebrow && (
          <p className="mb-6 font-body text-sm uppercase tracking-[0.3em] text-accent">{eyebrow}</p>
        )}
        <h1 className="mb-6 font-heading text-4xl leading-tight text-text md:text-6xl">{title}</h1>
        {subtitle && (
          <p className="mx-auto mb-10 max-w-xl font-body text-lg text-text/70 md:text-xl">{subtitle}</p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-4">
          {ctas.map((cta) => (
            <a
              key={cta.label}
              href={cta.href}
              className={
                cta.variant === 'secondary'
                  ? 'rounded-full border border-text/20 px-7 py-3 font-body text-text transition-colors hover:border-accent hover:text-accent'
                  : 'rounded-full bg-primary px-7 py-3 font-body text-bg transition-transform hover:scale-105'
              }
            >
              {cta.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
