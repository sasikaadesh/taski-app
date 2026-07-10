// websiteGenerator.js — generates a Next.js (App Router, static export) project via
// Claude AI, split into four passes: design brief, deterministic scaffold, section
// components, and content JSON. Output is a flat { path: contents } files map, never
// a single HTML string — see TASKI_PROJECT_CONTEXT.md / project plan for the schema.

import { getHero, heroComponentName, listHeroes } from './heroLibrary/index.js';

const MODEL = 'claude-sonnet-4-6';

// ── Low-level API helper ───────────────────────────────────────────────────────

async function callClaudeAPI(userMessage, systemPrompt, maxTokens) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':                              'application/json',
      'x-api-key':                                 apiKey,
      'anthropic-version':                         '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'API error: ' + response.status);
  }

  const data = await response.json();
  const rawText = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  return { rawText, stopReason: data.stop_reason, usage: data.usage };
}

function extractJson(raw) {
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('No JSON object found in response');
  return JSON.parse(text.substring(start, end + 1));
}

// Splits a "=== FILE: path ===\n<code>" formatted response into a { path: code } map
function extractFileBlocks(raw) {
  const files = {};
  const re = /===\s*FILE:\s*([^\s=]+)\s*===\s*([\s\S]*?)(?=(?:===\s*FILE:)|$)/g;
  let m;
  while ((m = re.exec(raw))) {
    const filePath = m[1].trim();
    const content = m[2].trim()
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    files[filePath] = content;
  }
  return files;
}

// ── Section type + component file naming ───────────────────────────────────────

const SECTION_COMPONENT_NAMES = {
  about:        'About',
  features:     'Features',
  gallery:      'Gallery',
  testimonials: 'Testimonials',
  cta:          'Cta',
  contact:      'Contact',
};

function componentFileName(type) {
  return SECTION_COMPONENT_NAMES[type];
}

function determineSectionTypes(options) {
  const types = ['about', 'features', 'gallery', 'testimonials', 'cta'];
  if (options.contact) types.push('contact');
  return types;
}

const COMPONENT_PROP_SPECS = {
  Nav:          `{ logoText, links: [{ label, href }], cta: { label, href } }`,
  Hero:         `{ type: "static"|"carousel"|"3d", eyebrow, title, subtitle, ctas: [{ label, href, variant }], images: [{ url, alt }], canvasEffect }`,
  Footer:       `{ brandBlurb, columns: [{ title, links: [{ label, href }] }], social: [{ platform, href }], copyright }`,
  About:        `{ heading, body, image: { url, alt } }`,
  Features:     `{ heading, items: [{ id, icon, title, description }] }`,
  Gallery:      `{ heading, images: [{ id, url, alt }] }`,
  Testimonials: `{ heading, items: [{ id, quote, name, role }] }`,
  Cta:          `{ heading, subtext, button: { label, href } }`,
  Contact:      `{ heading, showForm, email, phone, address }`,
};

// ── PASS 1 — design brief ───────────────────────────────────────────────────────

const DESIGN_BRIEF_SYSTEM = `You are a senior brand and frontend designer. Given a website brief, decide the visual direction.

Ground every choice in the brief's own subject, audience, and vocabulary — never default to generic startup aesthetics.

AVOID THESE OVERUSED AI DEFAULTS unless the brief specifically calls for one:
(1) cream background + serif + terracotta accent
(2) near-black + single acid-green/vermilion accent
(3) newspaper-style hairline-rule columns

Output ONLY a single JSON object, no markdown fences, no commentary, matching exactly:
{
  "palette": { "primary": "#hex", "accent": "#hex", "bg": "#hex", "surface": "#hex", "text": "#hex" },
  "fonts": { "heading": "Google Font Name", "body": "Google Font Name", "googleFontsUrl": "https://fonts.googleapis.com/css2?family=...&display=swap" },
  "motion": "one short sentence describing the animation/motion approach",
  "canvasEffect": "particles" | "geometric" | "wave" | "helix" | null,
  "industry": "detected industry or category",
  "voice": "one short sentence describing the copy tone",
  "styleKeywords": ["4-8 lowercase single-word adjectives capturing the visual mood, e.g. dark, premium, minimal, playful"]
}`;

async function generateDesignBrief(userPrompt, options) {
  const forcedColors = !!(options.theme && options.theme.id !== 'auto');
  // No hero type picked (or "auto") means the app auto-selects a hero after the brief
  const heroType = !options.heroType || options.heroType === 'auto'
    ? 'auto'
    : (options.heroType === 'normal' ? 'static' : options.heroType);

  let msg = `BRIEF: ${userPrompt}\n\n` +
    `STYLE: ${options.style || 'Premium, distinctive, memorable'}\n` +
    `INDUSTRY: ${options.industry || 'Detect from brief'}\n`;

  if (forcedColors) {
    const t = options.theme.colors || {};
    const acc = options.theme.customColor;
    msg += `\nCOLORS ARE FIXED — use exactly these in the "palette" field, do not change them:\n` +
      `primary: ${t.primary || acc}, accent: ${t.accent || acc}, bg: ${t.bg}, surface: ${t.surface}, text: ${t.text}\n`;
  } else if (options.colors) {
    msg += `\nCOLOR DIRECTION: ${options.colors}\n`;
  }

  if (heroType === 'auto') {
    msg += `\nHERO TYPE: automatic — after this brief the app deterministically picks either a prebuilt library hero or a static hero. Set "canvasEffect" to null.`;
  } else {
    msg += `\nHERO TYPE IS FIXED to "${heroType}". `;
    if (heroType === '3d') {
      msg += `Choose the best "canvasEffect" for this subject.`;
    } else if (heroType === 'library') {
      msg += `A prebuilt hero component will be used, themed by your palette — set "canvasEffect" to null.`;
    } else {
      msg += `Set "canvasEffect" to null.`;
    }
  }

  const { rawText } = await callClaudeAPI(msg, DESIGN_BRIEF_SYSTEM, 700);
  const brief = extractJson(rawText);

  if (forcedColors) {
    const t = options.theme.colors || {};
    const acc = options.theme.customColor;
    brief.palette = {
      primary: t.primary || acc || brief.palette.primary,
      accent:  t.accent  || acc || brief.palette.accent,
      bg:      t.bg      || brief.palette.bg,
      surface: t.surface || brief.palette.surface,
      text:    t.text    || brief.palette.text,
    };
  }

  brief.styleKeywords = Array.isArray(brief.styleKeywords)
    ? brief.styleKeywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean)
    : [];

  brief.heroType = heroType;
  return brief;
}

// ── Auto hero selection (deterministic scoring — no model call) ────────────────
// When heroType is "auto", the design brief's derived mood/style is matched against
// each catalog hero's mood[]/styleTags[]. Scoring:
//   +3  per hero mood[] word present in the brief's token set
//   +2  per hero styleTags[] word present in the brief's token set
//   +2  if the hero declares the same dark/light polarity as the palette background
//   -4  if it declares the opposite polarity
//   +1  if the hero is tagged "adaptive" (works on light or dark)
// Brief tokens = styleKeywords + words from voice/motion/industry, with both sides run
// through a small synonym map (e.g. "luxurious" -> "premium") so phrasing differences
// still match. Highest score wins; catalog order breaks ties. If no hero reaches
// AUTO_SELECT_THRESHOLD the generator falls back to the default static hero.

export const AUTO_SELECT_THRESHOLD = 3;

const TOKEN_SYNONYMS = {
  luxurious: 'premium', luxury: 'premium', upscale: 'premium', 'high-end': 'premium', exclusive: 'premium',
  'sci-fi': 'futuristic', tech: 'futuristic', technological: 'futuristic', cyber: 'futuristic',
  minimalist: 'minimal', simple: 'minimal', understated: 'minimal', crisp: 'minimal',
  strong: 'bold', punchy: 'bold', striking: 'bold', loud: 'bold',
  refined: 'elegant', sophisticated: 'elegant', graceful: 'elegant', classy: 'elegant',
  contemporary: 'modern', polished: 'sleek', smooth: 'sleek',
  cinematic: 'dramatic', moody: 'dramatic', intense: 'dramatic',
  upbeat: 'optimistic', energetic: 'optimistic', vibrant: 'optimistic', bright: 'optimistic',
  assured: 'confident', authoritative: 'confident', professional: 'confident',
};

function normalizeToken(word) {
  const w = String(word).toLowerCase();
  return TOKEN_SYNONYMS[w] || w;
}

function hexLuminance(hex) {
  const clean = String(hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return 1;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function deriveBriefTokens(brief) {
  const raw = [
    ...(brief.styleKeywords || []),
    ...String(brief.voice || '').split(/[^a-zA-Z0-9-]+/),
    ...String(brief.motion || '').split(/[^a-zA-Z0-9-]+/),
    ...String(brief.industry || '').split(/[^a-zA-Z0-9-]+/),
  ];
  const tokens = new Set(raw.map(normalizeToken).filter((w) => w.length > 2));
  const polarity = hexLuminance(brief.palette?.bg) < 0.35 ? 'dark' : 'light';
  return { tokens, polarity };
}

export function autoSelectHero(brief) {
  const { tokens, polarity } = deriveBriefTokens(brief);
  let best = null;

  for (const hero of listHeroes()) {
    let score = 0;
    const matched = [];

    for (const mood of hero.mood || []) {
      if (tokens.has(normalizeToken(mood))) { score += 3; matched.push(`mood "${mood}"`); }
    }
    for (const tag of hero.styleTags || []) {
      const t = normalizeToken(tag);
      if (t === 'dark' || t === 'light') {
        if (t === polarity) { score += 2; matched.push(`${t} palette`); }
        else { score -= 4; }
      } else if (t === 'adaptive') {
        score += 1; matched.push('adaptive');
      } else if (tokens.has(t)) {
        score += 2; matched.push(`tag "${tag}"`);
      }
    }

    if (!best || score > best.score) best = { slug: hero.slug, score, matched };
  }

  if (best && best.score >= AUTO_SELECT_THRESHOLD) {
    return {
      slug:   best.slug,
      score:  best.score,
      reason: `auto-matched ${best.matched.join(', ')} (score ${best.score} >= ${AUTO_SELECT_THRESHOLD})`,
    };
  }
  return {
    slug:   null,
    score:  best ? best.score : 0,
    reason: best
      ? `best candidate "${best.slug}" scored ${best.score} < ${AUTO_SELECT_THRESHOLD} — falling back to static hero`
      : 'hero library catalog is empty — falling back to static hero',
  };
}

// ── PASS 2 — deterministic scaffold (no model call) ────────────────────────────

export function buildScaffoldFiles() {
  const files = {};

  files['package.json'] = JSON.stringify({
    name:    'generated-site',
    version: '0.1.0',
    private: true,
    // Pinned versions: a known-good Next 14.2 + React 18.3 + Tailwind v3 combo.
    // 'next start' is invalid with output:'export' (Next 14 errors), so start
    // serves the built out/ folder instead. No lint script — eslint isn't shipped.
    scripts: { dev: 'next dev', build: 'next build', start: 'npx serve out' },
    dependencies: {
      next:        '14.2.35',
      react:       '18.3.1',
      'react-dom': '18.3.1',
    },
    devDependencies: {
      autoprefixer: '10.4.20',
      postcss:      '8.4.47',
      tailwindcss:  '3.4.13',
    },
  }, null, 2);

  files['next.config.js'] =
`/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

module.exports = nextConfig;
`;

  files['postcss.config.js'] =
`module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
`;

  // Semantic color/font names map to CSS custom properties injected by app/layout.jsx
  // from content/site.json — this file never contains a hex code or font name.
  files['tailwind.config.js'] =
`/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
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
  plugins: [],
};
`;

  files['app/globals.css'] =
`@tailwind base;
@tailwind components;
@tailwind utilities;

html {
  scroll-behavior: smooth;
}

body {
  background-color: rgb(var(--color-bg));
  color: rgb(var(--color-text));
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

  files['app/layout.jsx'] =
`// Root layout — injects theme tokens from content/site.json as CSS variables so
// editing site.json + rebuilding re-themes the whole site with no code changes.
import './globals.css';
import site from '../content/site.json';

function hexToRgbChannels(hex) {
  const clean = (hex || '#000000').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const bigint = parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return \`\${r} \${g} \${b}\`;
}

export const metadata = {
  title: site.meta.title,
  description: site.meta.description,
  openGraph: {
    title: site.meta.title,
    description: site.meta.description,
    siteName: site.meta.siteName,
    images: site.meta.ogImage ? [site.meta.ogImage] : [],
  },
};

export default function RootLayout({ children }) {
  const { colors, fonts } = site.theme;

  const themeVars = \`:root {
    --color-primary: \${hexToRgbChannels(colors.primary)};
    --color-accent: \${hexToRgbChannels(colors.accent)};
    --color-bg: \${hexToRgbChannels(colors.bg)};
    --color-surface: \${hexToRgbChannels(colors.surface)};
    --color-text: \${hexToRgbChannels(colors.text)};
    --font-heading: '\${fonts.heading}', sans-serif;
    --font-body: '\${fonts.body}', sans-serif;
  }\`;

  const jsonLd = {
    '@context':   'https://schema.org',
    '@type':      'Organization',
    name:         site.meta.siteName,
    description: site.meta.description,
  };

  return (
    <html lang={(site.meta.locale || 'en_US').split('_')[0]}>
      <head>
        <link rel="stylesheet" href={fonts.googleFontsUrl} />
        <style dangerouslySetInnerHTML={{ __html: themeVars }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-body">{children}</body>
    </html>
  );
}
`;

  files['public/robots.txt'] =
`User-agent: *
Allow: /

Sitemap: /sitemap.xml
`;

  files['public/sitemap.xml'] =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

  files['README.md'] =
`# Generated Site

Built by Taski's AI website generator (Next.js App Router, static export).

## Develop
\`\`\`bash
npm install
npm run dev
\`\`\`

## Build static export
\`\`\`bash
npm run build
\`\`\`
Output goes to \`out/\`. Deploy that folder to any static host.

## Preview the built site locally
\`\`\`bash
npm run start
\`\`\`
(\`next start\` does not work with static export — this serves \`out/\` with the
\`serve\` package instead.)

## Edit content
All copy lives in \`content/site.json\`, \`content/hero.json\`, and \`content/sections.json\`.
Edit those and rebuild — no component changes are needed for copy or theme edits.
`;

  return files;
}

// ── PASS 3 — section components ─────────────────────────────────────────────────

// Hero implementation rules, shared by initial generation and iterate-mode hero swaps
const HERO_3D_RULES = `'use client'; requestAnimationFrame loop that never stops except via the Page Visibility API (cancel on document.hidden, restart when visible again); on window resize only update canvas dimensions, never cancel/restart the loop; wrap the animate() call in try/catch so one bad frame can't kill the loop`;
const HERO_CAROUSEL_RULES = `'use client'; auto-advance every 5s via setInterval in useEffect (cleared on unmount), pause on mouseenter/resume on mouseleave, prev/next buttons and dot navigation update the same state`;
const HERO_STATIC_RULES = `full-viewport static hero using data.images[0] as an <img> background with a gradient overlay for text contrast`;

const COMPONENT_SYSTEM = `You are an elite frontend engineer building React components for a Next.js 14 App Router static-export site.

HARD TECHNICAL RULES:
- Plain functional components, plain JavaScript (.jsx), no TypeScript.
- Use <img> and <a> directly — NEVER next/image or next/link (this must also run in a dependency-free live preview with no bundler).
- NO external npm UI/animation libraries (no lucide-react, no framer-motion, no icon packages). Icons are inline <svg>.
- Use ONLY Tailwind utility classes, using these semantic classes which map to CSS variables: bg-bg, bg-surface, bg-primary, bg-accent, text-text, text-primary, text-accent, border-primary (opacity variants like bg-primary/10 work). Font classes: font-heading (headings), font-body (body text, default).
- Mark a component 'use client' at the top ONLY if it needs interactivity (state, effects, event handlers, canvas). Otherwise leave it a server component with no directive.
- Each component receives its data via a single \`data\` prop (an object) — never import content JSON directly inside a component, and never hardcode copy text.
- Motion: CSS transitions/keyframes and IntersectionObserver-driven scroll reveals only — no animation libraries.
- Mobile responsive (test 768px/480px breakpoints mentally).
- Respect prefers-reduced-motion.

OUTPUT FORMAT — this is critical:
For each file, output a marker line, then the raw code, with no markdown fences:
=== FILE: components/Name.jsx ===
<code>

Output every requested file, back to back, nothing else before or after.`;

async function generateComponents(userPrompt, brief, sectionTypes) {
  // Library heroes come from src/lib/heroLibrary, not model generation — skip Hero
  const names = brief.heroType === 'library'
    ? ['Nav', ...sectionTypes.map(componentFileName), 'Footer']
    : ['Nav', 'Hero', ...sectionTypes.map(componentFileName), 'Footer'];

  let msg = `BRIEF: ${userPrompt}\n\nDESIGN DIRECTION:\n` +
    `Palette: ${JSON.stringify(brief.palette)}\n` +
    `Fonts: ${brief.fonts.heading} (headings), ${brief.fonts.body} (body)\n` +
    `Motion: ${brief.motion}\n` +
    `Voice: ${brief.voice}\n` +
    `Hero type: ${brief.heroType}${brief.heroType === '3d' ? ' (canvas effect: ' + brief.canvasEffect + ')' : ''}\n\n` +
    `Generate exactly these component files, each consuming the documented \`data\` prop shape:\n\n`;

  for (const name of names) {
    msg += `components/${name}.jsx — data shape: ${COMPONENT_PROP_SPECS[name]}\n`;
  }

  if (brief.heroType === '3d') {
    msg += `\nHero.jsx 3D canvas rules: ${HERO_3D_RULES}.\n`;
  }
  if (brief.heroType === 'carousel') {
    msg += `\nHero.jsx carousel rules: ${HERO_CAROUSEL_RULES}.\n`;
  }

  const { rawText, stopReason } = await callClaudeAPI(msg, COMPONENT_SYSTEM, 16000);
  const files = extractFileBlocks(rawText);

  const missing = names.filter((n) => !files['components/' + n + '.jsx']);
  if (missing.length) {
    throw new Error(
      'Component generation incomplete, missing: ' + missing.join(', ') +
      (stopReason === 'max_tokens' ? ' (hit max_tokens)' : '')
    );
  }

  return files;
}

// ── PASS 4 — content JSON ───────────────────────────────────────────────────────

const CONTENT_SYSTEM = `You write real, compelling website copy — no lorem ipsum, no placeholders — matching a given design brief and brand voice.

Output ONLY a single JSON object, no markdown fences, no commentary, matching EXACTLY this shape:
{
  "site": {
    "meta": { "title": "", "description": "", "ogImage": "", "siteName": "", "locale": "en_US" },
    "nav": { "logoText": "", "links": [{ "label": "", "href": "#" }], "cta": { "label": "", "href": "#" } },
    "footer": { "brandBlurb": "", "columns": [{ "title": "", "links": [{ "label": "", "href": "#" }] }], "social": [{ "platform": "", "href": "#" }], "copyright": "" }
  },
  "hero": { "eyebrow": "", "title": "", "subtitle": "", "ctas": [{ "label": "", "href": "#", "variant": "primary|secondary" }], "images": [{ "url": "", "alt": "" }] },
  "sections": {
    "sections": [
      { "id": "about", "type": "about", "data": { "heading": "", "body": "", "image": { "url": "", "alt": "" } } },
      { "id": "features", "type": "features", "data": { "heading": "", "items": [{ "id": "", "icon": "", "title": "", "description": "" }] } },
      { "id": "gallery", "type": "gallery", "data": { "heading": "", "images": [{ "id": "", "url": "", "alt": "" }] } },
      { "id": "testimonials", "type": "testimonials", "data": { "heading": "", "items": [{ "id": "", "quote": "", "name": "", "role": "" }] } },
      { "id": "cta", "type": "cta", "data": { "heading": "", "subtext": "", "button": { "label": "", "href": "#" } } },
      { "id": "contact", "type": "contact", "data": { "heading": "", "showForm": true, "email": "", "phone": "", "address": "" } }
    ]
  }
}

Emit one section object per requested section type ONLY — e.g. include the "contact" object only when "contact" is in the requested list. Every section's "data" must match the shape shown above for its type exactly.

Real images MUST use this exact Unsplash pattern: https://images.unsplash.com/photo-{ID}?w=1200&q=80&auto=format&fit=crop — pick photo IDs matching the subject, vary them (never repeat one ID twice). Use 4-8 total across the whole site. All hrefs are "#". sections.sections order matters — it is the literal render order on the page. Every repeated item (features/testimonials/gallery entries) needs a short unique "id".`;

async function generateContent(userPrompt, brief, sectionTypes, options) {
  let msg = `BRIEF: ${userPrompt}\n\nVoice: ${brief.voice}\nIndustry: ${brief.industry}\n\n` +
    `Include exactly these section types, in this order, inside sections.sections: ${sectionTypes.join(', ')}.\n` +
    `Fonts and colors are already decided elsewhere — just write copy, do not include theme fields.\n`;

  if (options.contact) {
    const c = options.contact;
    msg += `\nContact section details to use verbatim: email="${c.email || ''}", phone="${c.phone || ''}", address="${c.address || ''}", showForm=${!!c.showForm}.\n`;
  }

  const { rawText } = await callClaudeAPI(msg, CONTENT_SYSTEM, 4000);
  const parsed = extractJson(rawText);

  parsed.site.theme = { colors: brief.palette, fonts: brief.fonts };
  parsed.hero.type = brief.heroType;
  if (brief.heroType === '3d') parsed.hero.canvasEffect = brief.canvasEffect;
  if (brief.heroType === 'library') parsed.hero.librarySlug = brief.librarySlug;

  return parsed; // { site, hero, sections }
}

// ── Library heroes (deterministic, no model call) ──────────────────────────────
// When content/hero.json is { "type": "library", "librarySlug": "<slug>", ... },
// the hero component comes from src/lib/heroLibrary instead of model generation:
// its raw source is written to components/heroes/<Name>.jsx and Hero.jsx becomes
// a thin wrapper, so app/page.jsx keeps rendering <Hero data={heroContent} />.

export function buildLibraryHeroFiles(librarySlug) {
  const hero = getHero(librarySlug);
  if (!hero) throw new Error(`Hero "${librarySlug}" not found in the hero library catalog`);

  const name = heroComponentName(librarySlug);
  return {
    [`components/heroes/${name}.jsx`]: hero.source,
    'components/Hero.jsx':
`// Hero.jsx — renders the "${librarySlug}" hero from the curated hero library (see content/hero.json)
import ${name} from './heroes/${name}';

export default function Hero({ data }) {
  return <${name} data={data} />;
}
`,
  };
}

// ── page.jsx assembly (deterministic) ───────────────────────────────────────────

function knownSectionTypes(types) {
  return types.filter((t) => componentFileName(t));
}

export function buildPageFile(sectionTypes) {
  const known = knownSectionTypes(sectionTypes);
  const names = ['Nav', 'Hero', ...known.map(componentFileName), 'Footer'];
  const imports = names.map((n) => `import ${n} from '../components/${n}';`).join('\n');
  const componentMap = known.map((t) => `  ${t}: ${componentFileName(t)},`).join('\n');

  return `import site from '../content/site.json';
import heroContent from '../content/hero.json';
import sectionsContent from '../content/sections.json';
${imports}

const SECTION_COMPONENTS = {
${componentMap}
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
`;
}

// ── Iterate — patches an existing project instead of regenerating it ──────────
// contentPatch is deep-merged into the existing content JSON: objects merge
// key-by-key, arrays REPLACE the existing array wholesale (so a patch that
// touches "sections" must include the full sections array it wants).

function deepMergePatch(target, patch) {
  if (Array.isArray(patch)) return patch;
  if (patch && typeof patch === 'object') {
    const base = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
    const result = { ...base };
    for (const key of Object.keys(patch)) {
      result[key] = deepMergePatch(base[key], patch[key]);
    }
    return result;
  }
  return patch;
}

const ITERATE_SYSTEM = `You are iterating on an existing generated Next.js site. You will be given the current content JSON, the list of existing component files, and an update request.

Respond with ONLY a single JSON object, no markdown fences:
{
  "contentPatch": { "site": {}, "hero": {}, "sections": {} },
  "filePatches": [ { "path": "components/Name.jsx", "content": "...full replacement file contents..." } ]
}

Rules:
- Only include keys that actually change in contentPatch — it will be deep-merged into the existing JSON (objects merge key-by-key, arrays REPLACE the existing array wholesale, so if you touch "sections" you must include the FULL sections array as you want it to end up, not just the changed item).
- Only include filePatches for components that need structural/visual code changes. Pure copy/color/font edits should go through contentPatch only, with an empty filePatches array — do NOT rewrite component code for a copy-only change.
- filePatches content must follow the same technical rules as original generation: plain <img>/<a>, no external UI libraries, semantic Tailwind color/font classes (bg-primary, text-text, font-heading, etc.), 'use client' only where interactive.`;

async function iterateWebsite(userPrompt, options, previousProject) {
  const { files, meta } = previousProject;

  const currentContent = {
    site:     JSON.parse(files['content/site.json']),
    hero:     JSON.parse(files['content/hero.json']),
    sections: JSON.parse(files['content/sections.json']),
  };

  const componentPaths = Object.keys(files).filter((p) => p.startsWith('components/'));

  let msg = `CURRENT CONTENT JSON:\n${JSON.stringify(currentContent, null, 2)}\n\n` +
    `EXISTING COMPONENT FILES: ${componentPaths.join(', ')}\n\n` +
    `UPDATE REQUESTED: "${userPrompt}"\n\n` +
    `Design tokens currently in use — preserve unless the request asks to change them: palette ${JSON.stringify(meta.brief.palette)}, fonts ${meta.brief.fonts.heading}/${meta.brief.fonts.body}.` +
    (options.contact ? `\nContact details: email="${options.contact.email || ''}", phone="${options.contact.phone || ''}", address="${options.contact.address || ''}".` : '');

  // Hero swap requested from the panel (type or library slug changed since generation).
  // Library swaps are fully deterministic (applied below, after the merge); non-library
  // swaps need the model to deliver a replacement Hero.jsx via filePatches.
  const heroChange = options.heroChange || null;
  if (heroChange) {
    if (heroChange.type === 'library') {
      msg += `\n\nHERO SWAP (handled by the app, not you): the hero is being replaced with the prebuilt library component "${heroChange.librarySlug}". Do NOT patch components/Hero.jsx or anything under components/heroes/, and do not change hero "type" or "librarySlug" in contentPatch. Only update hero copy fields (eyebrow/title/subtitle/ctas) if the update request itself asks for copy changes.`;
    } else {
      const rules = heroChange.type === '3d' ? HERO_3D_RULES
        : heroChange.type === 'carousel' ? HERO_CAROUSEL_RULES
        : HERO_STATIC_RULES;
      msg += `\n\nHERO CHANGE REQUIRED: replace the hero with a "${heroChange.type}" hero. Include a filePatch containing the FULL new components/Hero.jsx (same single \`data\` prop; ${rules}). Do not change hero "type" in contentPatch — the app sets it.`;
    }
  }

  const { rawText } = await callClaudeAPI(msg, ITERATE_SYSTEM, 8000);
  const { contentPatch = {}, filePatches = [] } = extractJson(rawText);

  const mergedContent = {
    site:     deepMergePatch(currentContent.site, contentPatch.site || {}),
    hero:     deepMergePatch(currentContent.hero, contentPatch.hero || {}),
    sections: deepMergePatch(currentContent.sections, contentPatch.sections || {}),
  };

  // Apply the panel's hero swap deterministically — it wins over anything the model
  // may have put in contentPatch.hero.
  if (heroChange) {
    if (heroChange.type === 'library') {
      mergedContent.hero.type = 'library';
      mergedContent.hero.librarySlug = heroChange.librarySlug;
      delete mergedContent.hero.canvasEffect;
    } else {
      mergedContent.hero.type = heroChange.type;
      delete mergedContent.hero.librarySlug;
      if (heroChange.type === '3d') mergedContent.hero.canvasEffect = mergedContent.hero.canvasEffect || 'particles';
      else delete mergedContent.hero.canvasEffect;
    }
  }

  const newFiles = { ...files };
  newFiles['content/site.json']     = JSON.stringify(mergedContent.site, null, 2);
  newFiles['content/hero.json']     = JSON.stringify(mergedContent.hero, null, 2);
  newFiles['content/sections.json'] = JSON.stringify(mergedContent.sections, null, 2);

  for (const patch of filePatches) {
    if (patch?.path && typeof patch.content === 'string') {
      newFiles[patch.path] = patch.content;
    }
  }

  // Library heroes are canonical: re-apply from the library so Hero.jsx and
  // components/heroes/ stay in sync with hero.json (e.g. slug changed via patch).
  if (mergedContent.hero.type === 'library' && mergedContent.hero.librarySlug) {
    Object.assign(newFiles, buildLibraryHeroFiles(mergedContent.hero.librarySlug));
  }

  // Switching away from a library hero: drop the now-unused heroes/ sources, but only
  // once a replacement Hero.jsx arrived that no longer references them (otherwise the
  // stale wrapper would import a deleted file).
  if (mergedContent.hero.type !== 'library' &&
      typeof newFiles['components/Hero.jsx'] === 'string' &&
      !newFiles['components/Hero.jsx'].includes('./heroes/')) {
    for (const p of Object.keys(newFiles)) {
      if (p.startsWith('components/heroes/')) delete newFiles[p];
    }
  }

  const orderedTypes = (mergedContent.sections.sections || []).map((s) => s.type);
  const uniqueTypes = [...new Set(orderedTypes)];
  newFiles['app/page.jsx'] = buildPageFile(uniqueTypes);

  return {
    files: newFiles,
    meta:  { ...meta, sectionTypes: knownSectionTypes(uniqueTypes), heroType: mergedContent.hero.type },
  };
}

// ── Post-generation self-check ──────────────────────────────────────────────────
// Lightweight validation of the emitted files map. Returns human-readable
// warnings (empty array = clean); never throws, since a flawed project may
// still preview fine and the user can regenerate.

const IMPORT_SPEC_RE = /^import\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm;

export function runSelfCheck(files) {
  const warnings = [];

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !content.trim()) {
      warnings.push(`${path} is empty`);
      continue;
    }

    if (path === 'package.json' || (path.startsWith('content/') && path.endsWith('.json'))) {
      try {
        JSON.parse(content);
      } catch (e) {
        warnings.push(`${path} is not valid JSON: ${e.message}`);
      }
    }

    if (path.endsWith('.jsx') && !/export\s+default/.test(content)) {
      warnings.push(`${path} has no default export`);
    }

    // Generated components must be dependency-free: react and relative imports only
    // (no next/image, next/link, next/font, or third-party packages).
    if (path.startsWith('components/') && path.endsWith('.jsx')) {
      for (const m of content.matchAll(IMPORT_SPEC_RE)) {
        const spec = m[1];
        if (spec !== 'react' && !spec.startsWith('.')) {
          warnings.push(`${path} imports "${spec}" — components must only import react or relative files`);
        }
      }
    }
  }

  // Library hero: hero.json declaring type "library" must reference a slug that exists
  // in the catalog AND have its component in the map (the generic .jsx checks above
  // then cover non-empty + default export).
  try {
    const hero = JSON.parse(files['content/hero.json'] || 'null');
    if (hero && hero.type === 'library') {
      if (!hero.librarySlug) {
        warnings.push('content/hero.json is type "library" but has no librarySlug');
      } else if (!getHero(hero.librarySlug)) {
        warnings.push(`library hero "${hero.librarySlug}" is not in the hero library catalog (or its source file is missing)`);
      } else {
        const heroPath = `components/heroes/${heroComponentName(hero.librarySlug)}.jsx`;
        if (!files[heroPath]) warnings.push(`${heroPath} is missing for library hero "${hero.librarySlug}"`);
      }
    } else if (hero && hero.type &&
               typeof files['components/Hero.jsx'] === 'string' &&
               files['components/Hero.jsx'].includes('./heroes/')) {
      warnings.push(`components/Hero.jsx still renders a library hero but content/hero.json is type "${hero.type}"`);
    }
  } catch { /* invalid hero.json is already reported by the JSON check above */ }

  return warnings;
}

// ── Main entry point ────────────────────────────────────────────────────────────

export async function generateWebsite(userPrompt, options = {}, previousProject = null) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set. Add it to your .env file.');

  if (previousProject) {
    console.log('[WebGen] Iterating on existing project...');
    const result = await iterateWebsite(userPrompt, options, previousProject);
    result.warnings = runSelfCheck(result.files);
    if (result.warnings.length) console.warn('[WebGen] Self-check warnings:', result.warnings);
    return result;
  }

  // Fail fast on a bad library slug — before any API spend
  if (options.heroType === 'library' && !getHero(options.librarySlug)) {
    throw new Error(`Library hero "${options.librarySlug || ''}" not found — pick a slug from the hero library catalog.`);
  }

  const sectionTypes = determineSectionTypes(options);

  console.log('[WebGen] Pass 1/4: design brief...');
  const brief = await generateDesignBrief(userPrompt, options);

  // Resolve "auto": deterministic catalog scoring against the brief, static fallback.
  let heroSelection;
  if (brief.heroType === 'auto') {
    const pick = autoSelectHero(brief);
    brief.heroType = pick.slug ? 'library' : 'static';
    if (pick.slug) brief.librarySlug = pick.slug;
    heroSelection = { mode: 'auto', slug: pick.slug, score: pick.score, reason: pick.reason };
    console.log('[WebGen] Auto hero selection:', pick.slug || 'static fallback', '—', pick.reason);
  } else {
    if (brief.heroType === 'library') brief.librarySlug = options.librarySlug;
    heroSelection = { mode: 'manual', slug: brief.librarySlug || null, reason: `hero type "${brief.heroType}" chosen by user` };
  }

  console.log('[WebGen] Pass 2/4: scaffold (deterministic, no API call)...');
  const scaffoldFiles = buildScaffoldFiles();

  console.log('[WebGen] Pass 3/4: section components...');
  const componentFiles = await generateComponents(userPrompt, brief, sectionTypes);

  console.log('[WebGen] Pass 4/4: content JSON...');
  const content = await generateContent(userPrompt, brief, sectionTypes, options);

  const files = {
    ...scaffoldFiles,
    ...componentFiles,
    ...(brief.heroType === 'library' ? buildLibraryHeroFiles(brief.librarySlug) : {}),
    'app/page.jsx':          buildPageFile(sectionTypes),
    'content/site.json':     JSON.stringify(content.site, null, 2),
    'content/hero.json':     JSON.stringify(content.hero, null, 2),
    'content/sections.json': JSON.stringify(content.sections, null, 2),
  };

  const warnings = runSelfCheck(files);
  if (warnings.length) console.warn('[WebGen] Self-check warnings:', warnings);

  console.log('[WebGen] Done. Files:', Object.keys(files).length);

  return {
    files,
    warnings,
    meta: { brief, sectionTypes, heroType: brief.heroType, heroSelection },
  };
}

// Checks that a generated project has the files a Next.js static-export build needs
export function validateProjectCompleteness(files) {
  const required = [
    'package.json', 'next.config.js', 'postcss.config.js', 'tailwind.config.js',
    'app/layout.jsx', 'app/page.jsx', 'app/globals.css',
    'content/site.json', 'content/hero.json', 'content/sections.json',
    'components/Nav.jsx', 'components/Hero.jsx', 'components/Footer.jsx',
  ];
  const missing = required.filter((p) => !files[p]);
  return { isComplete: missing.length === 0, missing };
}

// ── Template presets ──────────────────────────────────────────────────────────

export const WEBSITE_TEMPLATES = [
  {
    name:   'SaaS Landing',
    emoji:  '🚀',
    prompt: 'A stunning SaaS landing page for a project management AI tool called "FlowAI". Dark theme with electric blue and purple. Hero with animated floating UI cards, bento grid features, animated stats counter, glassmorphism testimonials, pricing toggle between monthly/annual, gradient CTA section.',
  },
  {
    name:   'Portfolio',
    emoji:  '✨',
    prompt: 'A creative developer portfolio for Alex Chen. Ultra dark theme, neon green (#00ff88) accents, Orbitron font for headings. Hero with name reveal animation, about timeline, 6 project cards with hover reveal, animated skill bars, minimal contact form.',
  },
  {
    name:   'Restaurant',
    emoji:  '🍽️',
    prompt: 'A luxury fine dining restaurant called "NOIR" serving contemporary French cuisine in New York. Black and gold aesthetic. Full viewport hero with food photography, elegant serif typography, animated menu sections with gold dividers, reservation form, chef story section, wine list.',
  },
  {
    name:   'Agency',
    emoji:  '🏆',
    prompt: 'A bold creative agency called "APEX Studio" specializing in brand identity and digital design. All black with white typography and electric yellow (#FFE500) accents. Huge hero typography with marquee, horizontal scroll work portfolio, services with hover reveals, client logos.',
  },
  {
    name:   'Startup',
    emoji:  '⚡',
    prompt: 'A Y Combinator-backed startup called "Luminary" that uses AI to personalize learning. Purple gradient theme on dark navy. Hero with animated neural network visualization, feature showcase with icons, social proof metrics, investor logos, team grid, waitlist CTA.',
  },
];

// ── Generation history ────────────────────────────────────────────────────────

const HISTORY_KEY = 'taski-website-history';

export function loadWebsiteHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

export function saveWebsiteToHistory(entry) {
  try {
    const history = loadWebsiteHistory();
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...history].slice(0, 20)));
  } catch { /* non-fatal */ }
}
