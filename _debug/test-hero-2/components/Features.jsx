// Features — simple card grid (test stub)
export default function Features({ data }) {
  return (
    <section id="features" className="bg-surface px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-12 text-center font-heading text-3xl text-text md:text-4xl">{data.heading}</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {data.items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-text/10 bg-bg p-6">
              <h3 className="mb-3 font-heading text-lg text-accent">{item.title}</h3>
              <p className="font-body text-sm leading-relaxed text-text/70">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
