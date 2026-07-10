// Gallery — responsive image grid (test stub)
export default function Gallery({ data }) {
  return (
    <section id="gallery" className="bg-bg px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-12 text-center font-heading text-3xl text-text md:text-4xl">{data.heading}</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.images.map((img) => (
            <img key={img.id} src={img.url} alt={img.alt} className="h-64 w-full rounded-2xl border border-text/10 object-cover" />
          ))}
        </div>
      </div>
    </section>
  );
}
