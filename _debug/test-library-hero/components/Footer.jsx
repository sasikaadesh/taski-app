// Footer — brand blurb, link columns, social row (test stub)
export default function Footer({ data }) {
  return (
    <footer className="border-t border-text/10 bg-bg px-6 py-16">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-3">
        <p className="font-body text-sm leading-relaxed text-text/60">{data.brandBlurb}</p>
        {data.columns.map((col) => (
          <div key={col.title}>
            <h3 className="mb-4 font-heading text-sm uppercase tracking-widest text-text/80">{col.title}</h3>
            <ul className="space-y-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="font-body text-sm text-text/60 transition-colors hover:text-accent">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl items-center justify-between border-t border-text/10 pt-8">
        <p className="font-body text-xs text-text/50">{data.copyright}</p>
        <div className="flex gap-4">
          {data.social.map((s) => (
            <a key={s.platform} href={s.href} className="font-body text-xs uppercase text-text/50 transition-colors hover:text-accent">{s.platform}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}
