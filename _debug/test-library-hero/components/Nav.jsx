// Nav — sticky top navigation (test stub for library-hero export)
export default function Nav({ data }) {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-text/10 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#" className="font-heading text-xl text-text">{data.logoText}</a>
        <div className="hidden items-center gap-8 md:flex">
          {data.links.map((link) => (
            <a key={link.label} href={link.href} className="font-body text-sm text-text/70 transition-colors hover:text-accent">
              {link.label}
            </a>
          ))}
        </div>
        <a href={data.cta.href} className="rounded-full bg-primary px-5 py-2 font-body text-sm text-bg transition-transform hover:scale-105">
          {data.cta.label}
        </a>
      </div>
    </nav>
  );
}
