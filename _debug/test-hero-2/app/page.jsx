import site from '../content/site.json';
import heroContent from '../content/hero.json';
import sectionsContent from '../content/sections.json';
import Nav from '../components/Nav';
import Hero from '../components/Hero';
import About from '../components/About';
import Features from '../components/Features';
import Gallery from '../components/Gallery';
import Testimonials from '../components/Testimonials';
import Cta from '../components/Cta';
import Footer from '../components/Footer';

const SECTION_COMPONENTS = {
  about: About,
  features: Features,
  gallery: Gallery,
  testimonials: Testimonials,
  cta: Cta,
};

export default function Home() {
  return (
    <>
      <Nav data={site.nav} />
      <Hero data={heroContent} />
      {sectionsContent.sections.map((section) => {
        const Component = SECTION_COMPONENTS[section.type];
        if (!Component) return null;
        return <Component key={section.id} data={section.data} />;
      })}
      <Footer data={site.footer} />
    </>
  );
}
