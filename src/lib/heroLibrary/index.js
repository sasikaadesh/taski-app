// heroLibrary/index.js — loads the curated 21st.dev hero catalog + raw component sources for the website generator
import catalog from './catalog.json';

// Hero sources are imported as raw strings (?raw) — they are template DATA for
// generated projects, never compiled as components into Taski's own bundle.
const heroSources = import.meta.glob('./heroes/*.jsx.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// "glass-aurora" -> "GlassAurora" (the component/file name inside generated projects)
export function heroComponentName(slug) {
  return String(slug || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
}

// All catalog entries (meta only) — Phase 3's picker UI reads this list.
export function listHeroes() {
  return catalog.map((meta) => ({ ...meta, componentName: heroComponentName(meta.slug) }));
}

// Returns { meta, source } for one hero, or null if the slug is unknown or its
// source file is missing (catalog and heroes/ must stay in sync).
export function getHero(slug) {
  const meta = catalog.find((h) => h.slug === slug);
  const source = heroSources['./heroes/' + slug + '.jsx.txt'];
  if (!meta || !source) return null;
  return { meta: { ...meta, componentName: heroComponentName(slug) }, source };
}
