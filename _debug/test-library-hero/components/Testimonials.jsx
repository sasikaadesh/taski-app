// Testimonials — quote cards (test stub)
export default function Testimonials({ data }) {
  return (
    <section id="testimonials" className="bg-surface px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-12 text-center font-heading text-3xl text-text md:text-4xl">{data.heading}</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {data.items.map((item) => (
            <figure key={item.id} className="rounded-2xl border border-text/10 bg-bg p-8">
              <blockquote className="mb-6 font-body text-lg leading-relaxed text-text/80">"{item.quote}"</blockquote>
              <figcaption className="font-body text-sm">
                <span className="text-accent">{item.name}</span>
                <span className="text-text/50"> — {item.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
