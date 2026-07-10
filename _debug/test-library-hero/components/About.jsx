// About — image + copy split section (test stub)
export default function About({ data }) {
  return (
    <section id="about" className="bg-bg px-6 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        <img src={data.image.url} alt={data.image.alt} className="w-full rounded-2xl border border-text/10 object-cover" />
        <div>
          <h2 className="mb-6 font-heading text-3xl text-text md:text-4xl">{data.heading}</h2>
          <p className="font-body text-lg leading-relaxed text-text/70">{data.body}</p>
        </div>
      </div>
    </section>
  );
}
