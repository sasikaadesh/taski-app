// Hero.jsx — renders the "glass-aurora" hero from the curated hero library (see content/hero.json)
import GlassAurora from './heroes/GlassAurora';

export default function Hero({ data }) {
  return <GlassAurora data={data} />;
}
