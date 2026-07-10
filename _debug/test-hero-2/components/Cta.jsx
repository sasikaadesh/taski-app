// Cta — closing call-to-action band (test stub)
export default function Cta({ data }) {
  return (
    <section id="cta" className="bg-primary/10 px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="mb-4 font-heading text-3xl text-text md:text-4xl">{data.heading}</h2>
        <p className="mb-8 font-body text-lg text-text/70">{data.subtext}</p>
        <a href={data.button.href} className="inline-block rounded-full bg-primary px-8 py-3 font-body text-bg transition-transform hover:scale-105">
          {data.button.label}
        </a>
      </div>
    </section>
  );
}
