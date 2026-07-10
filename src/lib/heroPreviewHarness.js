// heroPreviewHarness.js — builds sandboxed srcdoc HTML (React UMD + Babel standalone + Tailwind Play CDN)
// that live-renders a library hero's actual source inside an isolated iframe, for HeroPicker's
// mini-previews. Never static screenshots: the preview always compiles the real component source.
// The semantic Tailwind classes heroes use (bg-bg, text-primary, font-heading, ...) are mapped to
// CSS variables exactly like the generated site's tailwind.config.js, so the same source is themed
// by a neutral palette here and by the design brief's palette (content/site.json) in real builds.

// Neutral default palettes for previews only — real generations use the design brief's palette.
export const NEUTRAL_DARK  = { primary: '#6366f1', accent: '#22d3ee', bg: '#0b1220', surface: '#141d33', text: '#e6edf7' };
export const NEUTRAL_LIGHT = { primary: '#4f46e5', accent: '#db2777', bg: '#f8fafc', surface: '#ffffff', text: '#111827' };

// Light-tagged heroes preview on the light neutral palette; everything else on dark.
export function pickNeutralPalette(styleTags = []) {
  return styleTags.includes('light') ? NEUTRAL_LIGHT : NEUTRAL_DARK;
}

// Representative placeholder copy covering every field the catalog heroes consume
// (stats is optional and only rendered by heroes that support it).
export const SAMPLE_HERO_DATA = {
  eyebrow:  'Now in public beta',
  title:    'Build something people remember',
  subtitle: 'Representative placeholder copy so every hero previews with realistic text proportions.',
  ctas: [
    { label: 'Get Started', href: '#', variant: 'primary' },
    { label: 'Learn More',  href: '#', variant: 'secondary' },
  ],
  images: [],
  stats: [
    { value: '12k+',  label: 'Teams onboard' },
    { value: '99.9%', label: 'Uptime' },
    { value: '4.9/5', label: 'Avg rating' },
  ],
};

function hexToRgbChannels(hex) {
  const clean = (hex || '#000000').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const bigint = parseInt(full, 16);
  return `${(bigint >> 16) & 255} ${(bigint >> 8) & 255} ${bigint & 255}`;
}

// Babel standalone runs plain scripts, not ES modules — strip module syntax from the hero
// source. Library heroes are dependency-free, so imports (if any) only ever reference react,
// which the harness prelude already provides via globals.
function stripModuleSyntax(source) {
  return String(source)
    .replace(/^\s*['"]use client['"];?\s*$/m, '')
    .replace(/^\s*import\b[^\n]*$/gm, '')
    .replace(/export\s+default\s+function\s+/, 'function ')
    .replace(/export\s+default\s+/, 'window.__heroDefaultExport = ')
    .replace(/<\/script/gi, '<\\/script');
}

export function buildHeroPreviewHtml(source, componentName, { data = SAMPLE_HERO_DATA, palette = NEUTRAL_DARK } = {}) {
  const cleaned = stripModuleSyntax(source);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"><\/script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"><\/script>
<script src="https://unpkg.com/@babel/standalone@7.26.4/babel.min.js"><\/script>
<script src="https://cdn.tailwindcss.com"><\/script>
<script>
  // Same semantic color/font mapping as the generated site's tailwind.config.js
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          primary: 'rgb(var(--color-primary) / <alpha-value>)',
          accent:  'rgb(var(--color-accent) / <alpha-value>)',
          bg:      'rgb(var(--color-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-surface) / <alpha-value>)',
          text:    'rgb(var(--color-text) / <alpha-value>)',
        },
        fontFamily: {
          heading: ['var(--font-heading)', 'sans-serif'],
          body:    ['var(--font-body)', 'sans-serif'],
        },
      },
    },
  };
<\/script>
<style>
  :root {
    --color-primary: ${hexToRgbChannels(palette.primary)};
    --color-accent: ${hexToRgbChannels(palette.accent)};
    --color-bg: ${hexToRgbChannels(palette.bg)};
    --color-surface: ${hexToRgbChannels(palette.surface)};
    --color-text: ${hexToRgbChannels(palette.text)};
    --font-heading: 'Segoe UI', 'Helvetica Neue', sans-serif;
    --font-body: 'Segoe UI', 'Helvetica Neue', sans-serif;
  }
  html, body, #root { margin: 0; padding: 0; min-height: 100%; overflow: hidden; }
  body { background: rgb(var(--color-bg)); color: rgb(var(--color-text)); font-family: var(--font-body); }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
const { useState, useEffect, useRef, useMemo, useCallback } = React;
${cleaned}
const __Hero = typeof ${componentName} !== 'undefined' ? ${componentName} : window.__heroDefaultExport;
ReactDOM.createRoot(document.getElementById('root')).render(<__Hero data={${JSON.stringify(data)}} />);
<\/script>
</body>
</html>`;
}
