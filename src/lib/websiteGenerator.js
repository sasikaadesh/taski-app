// websiteGenerator.js — generates pure static HTML websites via Claude AI.

import { callClaude } from './claude';
import { analyzePrompt } from './promptAnalyzer';

// ── HTML extraction ───────────────────────────────────────────────────────────

function extractHTML(raw) {
  let text = raw.trim();

  const fenced = text.match(/```(?:html)?\s*\n?([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  const startIdx = text.search(/<!doctype\s+html/i);
  if (startIdx > 0) text = text.slice(startIdx);

  const endIdx = text.search(/<\/html\s*>\s*$/i);
  if (endIdx !== -1) {
    text = text.slice(0, endIdx + text.match(/<\/html\s*>/i)[0].length);
  } else {
    const bodyClose = text.lastIndexOf('</body>');
    if (bodyClose !== -1) {
      text = text.slice(0, bodyClose + 7) + '\n</html>';
    } else {
      text = text + '\n</body>\n</html>';
    }
  }

  return text.trim();
}

// ── Layout-specific instructions ──────────────────────────────────────────────

function getLayoutInstructions(analysis) {
  const map = {
    dashboard: `
LAYOUT TYPE: DASHBOARD APPLICATION
Build a complete dashboard with:
- Fixed sidebar (260px): logo, nav items with icons, user profile at bottom
- Fixed top header: search, notifications, avatar
- Main content area with:
  * 4 KPI metric cards (top row): metric value, label, trend % with arrow, sparkline SVG, icon circle. Animated counters on load.
  * Revenue/main metric chart (Chart.js line). Gradient fill, smooth curves.
  * Secondary charts row: Bar chart + Doughnut side by side
  * Data table with 8-10 rows: sortable, hover row highlight, status badges
  * Recent activity feed timeline
- Chart.js CDN MUST be included
- Sidebar collapses on mobile
- All charts use dark theme colors, animation on load (duration: 1000)
- Realistic data matching the ${analysis.industry} industry
`,
    portfolio: `
LAYOUT TYPE: PERSONAL PORTFOLIO
Build with:
- Hero: Full viewport, centered, dramatic. Name reveal animation (letters stagger). Role with typewriter effect cycling through 3 roles. Availability badge (green dot). Scroll indicator bouncing.
- About: Split layout photo + bio. Skills grid with tech icons/emoji + level indicators. Years exp, projects, clients counters.
- Projects: Featured (large) 2-col grid. All projects 3-col grid. Each: image, title, description, tech stack badges, links. Hover: image overlay with links.
- Experience: Vertical timeline. Company, role, dates, achievements.
- Testimonials: Horizontal scroll cards.
- Contact: Minimal form + social links. Copy email on click.
`,
    landing: `
LAYOUT TYPE: LANDING PAGE / SAAS
Build with all classic conversion sections:
- Hero: Full viewport, value proposition
- Social proof logos below hero
- Problem/Solution section
- Features: Bento grid
- How it works: 3 numbered steps
- Stats counter section
- Testimonials carousel
- Pricing: 3 tiers with toggle
- FAQ accordion (8 questions)
- Final CTA section (full width gradient)
- Newsletter footer
`,
    restaurant: `
LAYOUT TYPE: RESTAURANT WEBSITE
Build with:
- Hero: Full viewport food photography overlay. Dark overlay (opacity 0.5). Elegant script + sans-serif type mix. Reserve table CTA button.
- About: Chef story, restaurant philosophy. Photo of chef/restaurant.
- Menu: Tabbed sections (Starters/Mains/Desserts/Drinks). Each item: name, description, price. Beautiful card layout.
- Gallery: Masonry/grid with hover overlay. Food and ambiance photos.
- Reservations: Full booking form. Date, time, party size, notes. Working validation.
- Location/Hours: Split layout. Map placeholder + info column.
- Press/Awards badges.
`,
    agency: `
LAYOUT TYPE: CREATIVE AGENCY
Build with:
- Hero: Maximum impact typography. Huge headline, minimal design. Bold statement about the agency.
- Selected Work: Grid with case study cards. Large images, project name, category tag. Hover: image scale + overlay.
- Services: Clean list or card grid.
- Numbers: Impressive stats.
- Team: Card grid with photos + bios.
- Process: Numbered steps.
- Testimonials from notable clients.
- Bold CTA: "Let's work together"
`,
    ecommerce: `
LAYOUT TYPE: E-COMMERCE / PRODUCT PAGE
Build with:
- Hero: Product showcase, strong headline. Multiple product images/angles. Key features highlighted.
- Product highlights: icon + text pairs.
- Feature deep-dives: alternating sections.
- Specifications: clean table/grid.
- Reviews: Star ratings + testimonials. Review distribution bars.
- Pricing/CTA: Prominent buy section. Guarantee badges, shipping info.
- FAQ specific to product.
- Related items grid.
`,
    event: `
LAYOUT TYPE: EVENT PAGE
Build with:
- Hero: Full screen, event name, date, location. Countdown timer (JS) to event. Register CTA.
- About the event: speakers, agenda.
- Speaker cards: photo, name, role, bio.
- Schedule: Timeline or table.
- Venue: Location info + map placeholder.
- Tickets: Pricing tiers.
- Sponsors: Logo grid.
- FAQ.
- Registration form.
`,
    blog: `
LAYOUT TYPE: BLOG / EDITORIAL
Build with:
- Header: Logo, nav categories, search.
- Hero: Featured article (large). Image, category tag, title, excerpt, author + date.
- Article grid: 3-column layout. Each: image, category, title, excerpt, read time, author avatar.
- Sidebar: Search, categories, popular posts, newsletter signup.
- Pagination.
- Full footer.
`,
  };
  return map[analysis.layoutType] || map['landing'];
}

// ── Main generation function ──────────────────────────────────────────────────

export async function generateWebsite(userPrompt, options = {}) {
  const analysis = analyzePrompt(userPrompt);

  const finalTheme  = options.theme       || analysis.theme;
  const finalStyle  = options.visualStyle || analysis.visualStyle;
  const finalColors = options.colors      || analysis.colors;

  const layoutInstructions = getLayoutInstructions(analysis);

  const colorSystem = `
COLOR SYSTEM:
:root {
  --accent-1: ${finalColors.accent1};
  --accent-2: ${finalColors.accent2};
  --gradient: ${finalColors.gradient};
  ${finalTheme === 'dark' ? `
  --bg-primary: #050508;
  --bg-secondary: #0d0d14;
  --bg-card: #12121c;
  --bg-card-hover: #1a1a28;
  --border: rgba(255,255,255,0.08);
  --border-hover: rgba(255,255,255,0.15);
  --text-primary: #ffffff;
  --text-secondary: rgba(255,255,255,0.65);
  --text-muted: rgba(255,255,255,0.35);
  --shadow: rgba(0,0,0,0.5);
  ` : `
  --bg-primary: #fafafa;
  --bg-secondary: #f4f4f5;
  --bg-card: #ffffff;
  --bg-card-hover: #f8f8ff;
  --border: rgba(0,0,0,0.08);
  --border-hover: rgba(0,0,0,0.15);
  --text-primary: #09090b;
  --text-secondary: #52525b;
  --text-muted: #a1a1aa;
  --shadow: rgba(0,0,0,0.1);
  `}
}
[data-theme="dark"] {
  --bg-primary:#050508;--bg-secondary:#0d0d14;--bg-card:#12121c;--bg-card-hover:#1a1a28;
  --border:rgba(255,255,255,0.08);--border-hover:rgba(255,255,255,0.15);
  --text-primary:#ffffff;--text-secondary:rgba(255,255,255,0.65);--text-muted:rgba(255,255,255,0.35);--shadow:rgba(0,0,0,0.5);
}
[data-theme="light"] {
  --bg-primary:#fafafa;--bg-secondary:#f4f4f5;--bg-card:#ffffff;--bg-card-hover:#f8f8ff;
  --border:rgba(0,0,0,0.08);--border-hover:rgba(0,0,0,0.15);
  --text-primary:#09090b;--text-secondary:#52525b;--text-muted:#a1a1aa;--shadow:rgba(0,0,0,0.1);
}`;

  const featureAdditions = [
    analysis.features.wantsCharts ? `
CHARTS REQUIRED: Include Chart.js CDN. All charts: accent colors, gradient fills for line/area, smooth animations (duration 1200ms), custom tooltips matching theme. Realistic data for ${analysis.industry} industry.
` : '',
    (analysis.features.wants3DHero || analysis.visualStyle === '3d') ? `
3D HERO REQUIRED: Use canvas element with vanilla JS 3D. Create floating 3D geometric shapes using CSS perspective transforms OR animated canvas with rotating cubes/spheres using requestAnimationFrame and Math.sin/cos for smooth 3D rotation.
` : '',
    analysis.features.wantsParticles ? `
PARTICLE BACKGROUND REQUIRED: Canvas-based particle system. 80-100 particles floating, connected with lines when close, mouse interaction (particles attracted to cursor), accent color particles.
` : '',
    analysis.features.wantsForm ? `
CONTACT/BOOKING FORM REQUIRED: Fully styled form with beautiful field styling (dark bg, accent focus), real-time validation, error messages below invalid fields, loading state on submit button, success message after submit.
` : '',
    finalStyle === 'neon' ? `
NEON/CYBERPUNK STYLE: Glowing text shadows on headings, neon border glows on cards, scanline overlay effect (CSS), grid line background pattern, pulsing animation on accent elements.
` : '',
    finalStyle === 'glass' ? `
GLASSMORPHISM STYLE: All cards backdrop-filter blur(20px), background rgba(255,255,255,0.05-0.1), border rgba(255,255,255,0.1-0.2), colored glow behind glass elements.
` : '',
    finalStyle === 'retro' ? `
RETRO STYLE: Grain texture overlay (CSS noise filter), muted vintage color palette, serif fonts for headings, worn/aged aesthetic, polaroid-style image frames.
` : '',
  ].filter(Boolean).join('');

  const brandNameText = analysis.brandName
    ? `Brand/Company Name: "${analysis.brandName}"`
    : 'Create an appropriate brand name that fits the industry';

  const heroBackground =
    analysis.features.wantsParticles || analysis.layoutType === 'landing'
      ? 'Canvas particle network with mouse interaction'
      : finalStyle === '3d' || analysis.features.wants3DHero
      ? 'CSS 3D rotating geometric shapes using perspective'
      : 'Animated CSS gradient mesh with morphing blobs';

  const userMessage = `
Create a WORLD-CLASS, award-winning static HTML website for:

${userPrompt}

${brandNameText}
Layout Type: ${analysis.layoutType.toUpperCase()}
Theme: ${finalTheme.toUpperCase()}
Color Accent: ${finalColors.accent1}
Visual Style: ${finalStyle.toUpperCase()}
Industry: ${analysis.industry.toUpperCase()}

LAYOUT SPECIFIC REQUIREMENTS:
${layoutInstructions}

${colorSystem}

FEATURE REQUIREMENTS:
${featureAdditions}

NAVIGATION (always):
- Logo (brand name in gradient text)
- Nav links with hover underline animation
- Dark/Light mode toggle (🌙/☀️ icon). Stores in localStorage, applies data-theme to html element. Smooth color transition 0.3s on all elements.
- CTA button (gradient, pill shape)
- Mobile: hamburger menu. Full screen overlay. Links animate in with stagger.

HERO (always exceptional):
- Animated background: ${heroBackground}
- Massive headline: clamp(48px, 8vw, 110px). Per-letter stagger animation on load.
- Gradient text on 1-2 key words
- Animated subheading (0.35s delay)
- 2 CTA buttons: gradient pill + glass pill
- Social proof element below buttons

SCROLL ANIMATIONS (all sections):
gsap.registerPlugin(ScrollTrigger)
ScrollTrigger.batch(".reveal", {
  onEnter: elements => gsap.from(elements, { y: 50, opacity: 0, duration: 0.8, stagger: 0.12, ease: "power3.out", clearProps: "all" }),
  once: true, start: "top 88%"
})
Add class="reveal" to every section element.

CARDS (everywhere):
- Glassmorphism: rgba(255,255,255,0.04) bg
- border: 1px solid var(--border)
- border-radius: 16-20px, padding: 28-32px
- Hover 3D tilt (JavaScript mousemove)
- Hover: border-color accent, translateY(-4px) + box-shadow glow
- Transition: all 0.4s cubic-bezier(0.16,1,0.3,1)

TYPOGRAPHY: Google Fonts Plus Jakarta Sans (headings) + Inter (body) from fonts.googleapis.com CDN

FOOTER (always beautiful):
4-column grid: Logo+tagline+social icons | Product links | Company links | Newsletter input
Bottom bar: copyright © ${new Date().getFullYear()} + legal links
Top: 1px gradient separator. Background slightly different from page bg.

CONTENT (always real, never placeholder):
Write specific professional copy matching the ${analysis.industry} industry. Real product/service names, real pricing, real feature descriptions, real testimonials with full names and companies. Make copy persuasive and conversion-focused.

CDN LIBRARIES:
GSAP: https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js
ScrollTrigger: https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js
${analysis.features.wantsCharts ? 'Chart.js: https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js' : ''}

IMAGES:
Hero bg: https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920&q=80
People: https://i.pravatar.cc/100?img=[1-70]
Tech: https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80
Office: https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80
Abstract: https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&q=80

OUTPUT RULES:
- Start with: <!DOCTYPE html>
- End with: </html>
- No markdown, no backticks, no explanation
- Minimum 500 lines
- All CSS in <style> in <head>
- All JS in <script> before </body>
- Complete, fully working HTML only
`.trim();

  const systemPrompt = `You are the world's best UI/UX designer and web developer. You create award-winning websites that win Awwwards, CSS Design Awards, and FWA. You ALWAYS output ONLY raw HTML code. You NEVER use markdown or backticks. You NEVER write explanations. Your output ALWAYS starts with <!DOCTYPE html> and ends with </html>. You write complete, production-ready, stunning websites every single time.`;

  // Assistant prefill forces Claude to start with DOCTYPE
  const messages = [
    { role: 'user',      content: userMessage },
    { role: 'assistant', content: '<!DOCTYPE html>' },
  ];

  let raw;
  try {
    raw = await callClaude(messages, { system: systemPrompt, maxTokens: 16000 });
  } catch (err) {
    throw new Error(`Claude API error: ${err.message}`);
  }

  const full      = '<!DOCTYPE html>' + raw;
  const cleanHTML = extractHTML(full);

  if (!/<html[\s>]/i.test(cleanHTML)) {
    throw new Error('Claude returned unexpected output. Please try again.');
  }

  return {
    success:   true,
    html:      cleanHTML,
    analysis,
    prompt:    userPrompt,
    timestamp: new Date().toISOString(),
    id:        `website_${Date.now()}`,
  };
}

// ── Multi-page generation ─────────────────────────────────────────────────────

export async function generateMultiPageWebsite(userPrompt, pages = ['index', 'about', 'contact'], options = {}) {
  const results = {};
  for (const pageName of pages) {
    const pagePrompt = pageName === 'index'
      ? userPrompt
      : `${pageName} page for this website: ${userPrompt}. Use identical colors, fonts, nav, and footer as the home page.`;
    const result = await generateWebsite(pagePrompt, options);
    results[pageName + '.html'] = result.html;
  }
  return { success: true, pages: results, prompt: userPrompt, pageCount: pages.length, id: `website_${Date.now()}` };
}

// ── Template presets ──────────────────────────────────────────────────────────

export const WEBSITE_TEMPLATES = [
  {
    name:   'SaaS Landing',
    emoji:  '🚀',
    prompt: 'A stunning SaaS landing page for a project management AI tool. Dark theme with electric blue and purple gradients. Hero with particle background, feature bento grid with 3D hover cards, animated stats, glassmorphism testimonials, pricing toggle, gradient CTA. GSAP animations throughout.',
  },
  {
    name:   'Portfolio',
    emoji:  '✨',
    prompt: 'A creative developer portfolio. Ultra dark theme, neon green accents. Animated hero with name typewriter reveal, about timeline, projects grid with hover reveal, skills with animated bars, contact with magnetic form. Cursor glow effect.',
  },
  {
    name:   'Dashboard',
    emoji:  '📊',
    prompt: 'A modern analytics dashboard. Dark navy theme with cyan accents. 4 KPI cards, line chart, bar chart, doughnut chart, data table, recent activity feed, fixed sidebar with nav icons.',
  },
  {
    name:   'Product',
    emoji:  '🎯',
    prompt: 'A premium product landing page for luxury wireless headphones. Deep black theme, gold accents. Large hero with product imagery and particles, alternating feature sections, specs table, star-rated reviews, bold magnetic CTA button.',
  },
  {
    name:   'Agency',
    emoji:  '🏆',
    prompt: 'A bold creative agency website. All black with white typography and neon yellow accents. Huge hero typography with scramble text effect, horizontal scroll work portfolio, services with hover reveals, team cards with flip effect, awards ticker.',
  },
  {
    name:   'Restaurant',
    emoji:  '🍽️',
    prompt: 'A luxury restaurant website with gold accents. Dark elegant theme. Full viewport hero with food photography, tabbed menu sections, reservation booking form, gallery with masonry grid, chef story section.',
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
