// EditorialGradient — curated library hero: bold editorial gradient-text headline over a soft mesh-gradient background, single primary CTA and a bouncing scroll cue, CSS-only motion

export default function EditorialGradient({ data }) {
  const { title, subtitle, ctas = [] } = data || {};

  const rise = (i) => ({ animation: `eg-rise 0.8s ease-out ${i * 0.15}s both` });

  return (
    <section className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-bg px-6 py-24">
      <style>{`
        @keyframes eg-rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes eg-bounce {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(8px); }
        }
      `}</style>

      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute -top-1/4 left-[-10%] h-2/3 w-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute right-[-10%] top-[10%] h-1/2 w-1/2 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[20%] h-2/3 w-2/3 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-4xl text-center">
        <h1
          className="mb-8 bg-gradient-to-br from-primary via-text/90 to-accent bg-clip-text font-heading text-5xl leading-[1.05] tracking-tight text-transparent md:text-7xl lg:text-8xl"
          style={rise(0)}
        >
          {title}
        </h1>

        {subtitle && (
          <p className="mx-auto mb-10 max-w-2xl font-body text-lg text-text/70 md:text-xl" style={rise(1)}>
            {subtitle}
          </p>
        )}

        {ctas.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-4" style={rise(2)}>
            {ctas.map((cta) => (
              <a
                key={cta.label}
                href={cta.href}
                className={
                  cta.variant === 'secondary'
                    ? 'rounded-full border border-text/20 px-7 py-3 font-body text-text transition-colors hover:border-accent hover:text-accent'
                    : 'rounded-full bg-primary px-8 py-3.5 font-body text-lg text-bg transition-transform hover:scale-105'
                }
              >
                {cta.label}
              </a>
            ))}
          </div>
        )}
      </div>

      <div
        aria-hidden="true"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-text/40"
        style={{ animation: 'eg-bounce 2s ease-in-out infinite' }}
      >
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </section>
  );
}
