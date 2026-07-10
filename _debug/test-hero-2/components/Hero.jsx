// Hero.jsx — renders the "editorial-gradient" hero from the curated hero library (see content/hero.json)
import EditorialGradient from './heroes/EditorialGradient';

export default function Hero({ data }) {
  return <EditorialGradient data={data} />;
}
