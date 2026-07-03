// websiteGenerator.js — generates complete, stunning static HTML websites via Claude AI.

const WEBSITE_SYSTEM_PROMPT = `
You are an elite frontend designer at a studio known for distinctive, never-generic websites. You follow these principles rigorously (Anthropic Frontend Design methodology):

═══ DESIGN PHILOSOPHY ═══

GROUND IT IN THE SUBJECT:
Before designing, identify the concrete subject, its audience, and the page's job. Build every choice from the subject's own world — its materials, vocabulary, visual language. Never default to generic startup aesthetics regardless of subject.

THE HERO IS A THESIS:
Open with the most characteristic thing in the subject's world. Not just headline + subtitle + button — that is the lazy default. Consider: a striking image, an animated reveal, an unexpected layout, a live element. Make a deliberate, justified choice.

TYPOGRAPHY CARRIES PERSONALITY:
Choose a characterful display face and a complementary body face from Google Fonts — not the same pairing you'd use for any project. Set a clear type scale with intentional weight and spacing.

AVOID THESE OVERUSED AI DEFAULTS:
(1) cream background + serif + terracotta
(2) near-black + single acid-green/vermilion accent
(3) newspaper-style hairline-rule columns
Pick something else unless the brief specifically asks for one of these.

STRUCTURE ENCODES MEANING:
Only number things that are truly sequential. Dividers and labels should communicate real information, not decorate.

ONE BOLD SIGNATURE CHOICE:
Spend your boldness in exactly one memorable element. Keep everything else disciplined and quiet around it.

═══ MANDATORY COMPLETE STRUCTURE ═══

You MUST generate ALL of these sections in full — this is non-negotiable:

1. <nav> — Fixed/sticky navigation, logo, 5-6 links, CTA button. Backdrop blur. The nav MUST have a fixed, known height: nav { height: 70px; position: fixed; top: 0; left: 0; right: 0; z-index: 100; }

2. <section class="hero"> — Full viewport height, the thesis statement, animated entrance, 1-2 CTAs, scroll indicator

3. <section class="about"> — 2-column or asymmetric layout, real paragraph copy (80-150 words), one supporting Unsplash image

4. <section class="features"> — Grid of 4-6 cards, each with icon/image, title, 2-sentence description

5. <section class="gallery"> — Visual showcase grid with 4-6 real Unsplash images relevant to the subject, hover effects

6. <section class="testimonials"> — 2-3 testimonial cards with quote, name, role

7. <section class="cta"> — Bold closing call-to-action with contrasting background

8. <footer> — Multi-column: brand blurb, 3-4 link columns, social icons, copyright

CRITICAL: Do not stop after the hero. Do not stop after about. You MUST write the complete HTML through every single section listed above, ending with the closing </footer></body></html> tags. A response that does not include the footer is an INCOMPLETE and FAILED response.

═══ REAL IMAGES — UNSPLASH ═══

Embed real images using this exact pattern:
<img src="https://images.unsplash.com/photo-{ID}?w=1200&q=80&auto=format" alt="descriptive alt text" loading="lazy">

Good Unsplash photo IDs by subject:
Coffee/dark: 1447933601652-e9dcff3b40df
Luxury/dark: 1414235077428-338989a2e8c0
Food/restaurant: 1504674900247-0877df9cc836
Architecture: 1486325212027-8081e485255e
Nature/landscape: 1506905925346-21bda4d32df4
Technology: 1518770660439-4636190af475
Fashion/style: 1469334031218-e382a71b716b
People/portrait: 1507003211169-0a1dd7228f2d
Abstract/texture: 1557682250-33bd709cbe85
Business/office: 1497366216548-37526070297c
City/urban: 1477959858617-67f85cf4f1df
Interior/design: 1555041469-149743f17dc4
Fitness/gym: 1534438327167-9be0be031527
Beauty/spa: 1516975080664-ed2fc6a32937
Startup/work: 1522202176988-66273c2fd55f
Music/concert: 1493225457124-a3eb161ffa5f
Travel/adventure: 1469854523086-cc02fe5d8800
Sport/action: 1517649763962-0c623066013b
Medical/health: 1576671081837-49000212a0fc
Education: 1523050854058-8df90110c9f1

Select photo IDs matching the subject matter. Use 4-8 different images across the gallery and supporting sections. Vary the IDs — never repeat the same image twice on one page.

VERIFIED WORKING UNSPLASH IDs — prefer these when they fit the subject:
technology: 1518770660439-4636190af475, 1461749280684-dccba630e2f6, 1550751827-4bd374c3f58b
medical: 1559757148-5c350d0d3c56, 1576091160399-112ba8d25d1d, 1631815588090-d4bfec5b1ccb
education: 1503676260728-1c00da094a0b, 1523050854058-8df90110c9f1, 1509062522246-3755977927d7
business: 1497366216548-37526070297c, 1454165804606-c3d57bc86b40, 1507679799987-c73779587ccf
nature: 1441974231531-c6227db76b6e, 1506905925346-21bda4d32df4, 1469474968028-56623f02e42e
food: 1504674900247-0877df9cc836, 1414235077428-338989a2e8c0, 1567620905732-2d1ec7ab7445
architecture: 1486325212027-8081e485255e, 1480714378408-67cf0d13bc1b, 1431576901776-e539bd916ba2
people: 1507003211169-0a1dd7228f2d, 1500648767791-00dcc994a43e, 1438761681033-6461ffad8d80
abstract: 1557682250-33bd709cbe85, 1518655048521-f130df041f66, 1487017159836-4e23ece2e4cf

Always use this full URL format with fit=crop: https://images.unsplash.com/photo-{ID}?w=800&h=600&q=80&auto=format&fit=crop

Every <img> tag MUST include an onerror fallback so a failed load never leaves a blank hole:
<img src="https://images.unsplash.com/photo-{ID}?w=800&q=80&auto=format&fit=crop" alt="descriptive alt text" loading="lazy" onerror="this.style.background='linear-gradient(135deg,#1a1a3e,#0a0a2e)';this.src='';this.onerror=null;" style="width:100%;height:100%;object-fit:cover;">

For any card or section background-image that uses an Unsplash URL, always layer a gradient fallback behind it so a failed load still shows color:
.card-image { background: url('unsplash-url') center/cover, linear-gradient(135deg, #1a1a3e, #2a2a6e); }

═══ LAYOUT RULES — HERO CLEARANCE ═══

CRITICAL: The hero section must have padding-top equal to the nav height (70px) so no content is hidden behind the sticky navigation. Apply to every hero type:
.hero { padding-top: 70px; box-sizing: border-box; }
.hero-content { padding-top: 80px !important; }
Use min-height: calc(100vh) on the hero, not height: 100vh, so content is never clipped. The hero-content div must be positioned to be fully visible below the navigation bar.

IMPORTANT: The scroll indicator ("EXPLORE"/"SCROLL" element) must NEVER overlap the hero CTA buttons. Either add margin-bottom: 80px to .hero-content, or position the scroll indicator to the side instead of center-bottom:
.hero-scroll { position: absolute; bottom: 2rem; right: 3rem; left: auto; transform: none; writing-mode: vertical-rl; letter-spacing: 0.2em; pointer-events: none; z-index: 2; }
.hero-cta { margin-bottom: 60px; }
Test that CTA buttons are fully visible and never covered by the scroll indicator.

═══ MOTION ═══

Add purposeful animation:
- Hero entrance animation on page load
- IntersectionObserver-based scroll reveals for each section (fade + slight translateY)
- Hover micro-interactions on cards/buttons
- Respect prefers-reduced-motion

═══ TECHNICAL RULES ═══

- Output ONLY raw HTML, no markdown fences
- Start with <!DOCTYPE html>, end with </html>
- All CSS in one <style> block in <head>
- Google Fonts via @import url(...)
- CSS custom properties (--color-x) for tokens
- All <a> tags use href="#"
- Mobile responsive: test breakpoints at 768px and 480px
- Smooth scroll-behavior on html element

Write efficient, compact CSS — avoid excessive repetition — so you have token budget to complete EVERY section. Prioritize finishing all 8 sections over excessive polish on any single one. A complete simple page beats an incomplete beautiful one.
`;

// ── Low-level API helper ───────────────────────────────────────────────────────

async function callClaudeForWebsite(userMessage, systemPrompt, maxTokens) {
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
      model:      'claude-sonnet-4-6',
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

  let html = rawText
    .replace(/^```html?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  return {
    html,
    stopReason: data.stop_reason,
    usage:      data.usage,
    rawText,
  };
}

// ── Post-process raw HTML from a pass ─────────────────────────────────────────

function extractHtml(raw) {
  let html = raw
    .replace(/^```html?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const doctypeIdx = html.toLowerCase().indexOf('<!doctype');
  if (doctypeIdx > 0) {
    html = html.substring(doctypeIdx);
  } else if (!html.toLowerCase().startsWith('<!doctype')) {
    const htmlIdx = html.toLowerCase().indexOf('<html');
    if (htmlIdx >= 0) html = html.substring(htmlIdx);
  }

  return html;
}

// ── Iteration summary ──────────────────────────────────────────────────────────
// Sending the full previous HTML back to Claude for every small tweak burns ~10K
// input tokens and is slow. Instead, summarize the existing site's structure/design
// tokens and ask Claude to regenerate from scratch while preserving that direction.

function summarizeHtmlForIteration(html) {
  const sections = [];
  const sectionMatches = html.matchAll(/<(?:section|div)[^>]+(?:id|class)="([^"]+)"/gi);
  for (const m of sectionMatches) {
    sections.push(m[1].split(' ')[0]);
  }

  return {
    totalLength: html.length,
    sections:    [...new Set(sections)].slice(0, 20),
    hasCanvas:   html.includes('<canvas'),
    hasCarousel: html.includes('carousel'),
    hasContact:  html.includes('contact'),
    cssVars:     (html.match(/--[\w-]+:\s*[^;]+/g) || []).slice(0, 10),
    fonts:       (html.match(/family=([^&"']+)/g) || []).slice(0, 3),
  };
}

// ── Main generation function ──────────────────────────────────────────────────

export async function generateWebsite(userPrompt, options = {}, previousHtml = null) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('VITE_ANTHROPIC_API_KEY is not set. Add it to your .env file.');
  }

  // Build user message
  let userMessage = '';

  if (previousHtml) {
    const summary = summarizeHtmlForIteration(previousHtml);

    userMessage =
      `WEBSITE UPDATE REQUEST\n\n` +
      `Current site summary:\n` +
      `- Total size: ${summary.totalLength} chars\n` +
      `- Sections: ${summary.sections.join(', ')}\n` +
      `- Has canvas 3D: ${summary.hasCanvas}\n` +
      `- Has carousel: ${summary.hasCarousel}\n` +
      `- Has contact: ${summary.hasContact}\n` +
      `- Font families: ${summary.fonts.join(', ')}\n` +
      `- CSS vars: ${summary.cssVars.join('; ')}\n\n` +
      `UPDATE REQUESTED: "${userPrompt}"\n\n` +
      `Generate the COMPLETE updated website HTML from scratch applying this change. ` +
      `Preserve the overall design direction, color scheme, fonts, and sections. ` +
      `Only change what was explicitly requested.\n` +
      `Start with <!DOCTYPE html>, end with </html>. ` +
      `Include ALL 8 sections: nav, hero, about, features, gallery, testimonials, cta, footer.`;
  } else {
    userMessage =
      `Create a complete stunning website.\n\n` +
      `BRIEF: ${userPrompt}\n\n` +
      `STYLE: ${options.style || 'Premium, distinctive, memorable'}\n` +
      `INDUSTRY: ${options.industry || 'Detect from brief'}\n` +
      `COLORS: ${options.colors || 'Choose deliberately for this brief'}\n\n` +
      `REQUIREMENTS:\n` +
      `- Complete HTML from <!DOCTYPE html> to </html>\n` +
      `- ALL 8 required sections: nav, hero, about, features, gallery, testimonials, cta, footer\n` +
      `- Real Unsplash images matching the subject (4-8 images, vary the IDs)\n` +
      `- Distinctive typography from Google Fonts\n` +
      `- Impressive hero with CSS animation\n` +
      `- Real compelling copy (no lorem ipsum, no placeholders)\n` +
      `- All links use href="#"\n` +
      `- Mobile responsive\n` +
      `- IntersectionObserver scroll animations\n\n` +
      `Output ONLY the raw HTML. Start with <!DOCTYPE html> immediately. Do not wrap in code blocks.`;

    // Append hero-type-specific instructions
    if (!options.heroType || options.heroType === 'normal') {
      userMessage += `

HERO SECTION REQUIREMENTS — STATIC HERO:
The hero must use a real Unsplash image as a full-viewport background.

HTML structure:
<section class="hero" id="hero">
  <div class="hero-bg"></div>
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <p class="hero-eyebrow">tagline text</p>
    <h1 class="hero-title">Main Headline</h1>
    <p class="hero-subtitle">Supporting copy</p>
    <div class="hero-cta">
      <a href="#" class="btn-primary">Primary CTA</a>
      <a href="#" class="btn-secondary">Secondary CTA</a>
    </div>
  </div>
  <div class="hero-scroll"><span>SCROLL</span><div class="scroll-line"></div></div>
</section>

CSS requirements:
.hero { position: relative; min-height: calc(100vh); padding-top: 70px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.hero-bg { position: absolute; inset: 0; background-image: url('https://images.unsplash.com/photo-{RELEVANT_ID}?w=1600&q=85&auto=format'); background-size: cover; background-position: center; transform: scale(1.05); animation: heroBgZoom 8s ease-out forwards; }
.hero-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.8) 100%); }
.hero-content { position: relative; z-index: 2; text-align: center; max-width: 800px; padding: 80px 2rem 0; animation: heroFadeUp 1.2s ease-out forwards; }
.hero-cta { margin-bottom: 60px; }
@keyframes heroBgZoom { from { transform: scale(1.05); } to { transform: scale(1); } }
@keyframes heroFadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
.hero-scroll { position: absolute; bottom: 2rem; right: 3rem; left: auto; transform: none; writing-mode: vertical-rl; display: flex; flex-direction: column; align-items: center; gap: 8px; color: rgba(255,255,255,0.5); font-size: 10px; letter-spacing: 0.2em; z-index: 2; pointer-events: none; }
.scroll-line { width: 1px; height: 40px; background: linear-gradient(to bottom, rgba(255,255,255,0.5), transparent); animation: scrollPulse 2s ease-in-out infinite; }
@keyframes scrollPulse { 0%, 100% { opacity: 0.3; transform: scaleY(1); } 50% { opacity: 1; transform: scaleY(0.6); } }
CRITICAL: the scroll indicator (.hero-scroll) must never overlap .hero-cta — keep it to the side as shown above, not centered at the bottom.`;
    } else if (options.heroType === 'carousel') {
      userMessage += `

HERO SECTION REQUIREMENTS — CAROUSEL HERO:
Build a full-viewport hero that auto-slides through 4 different Unsplash images with smooth crossfade transitions. Include headline overlay, dot navigation, and arrow controls. Use pure CSS + JS, no library.

HTML structure:
<section class="hero" id="hero">
  <div class="carousel-track">
    <div class="carousel-slide active" style="background-image:url('https://images.unsplash.com/photo-{ID1}?w=1600&q=80&auto=format')"></div>
    <div class="carousel-slide" style="background-image:url('https://images.unsplash.com/photo-{ID2}?w=1600&q=80&auto=format')"></div>
    <div class="carousel-slide" style="background-image:url('https://images.unsplash.com/photo-{ID3}?w=1600&q=80&auto=format')"></div>
    <div class="carousel-slide" style="background-image:url('https://images.unsplash.com/photo-{ID4}?w=1600&q=80&auto=format')"></div>
  </div>
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <p class="hero-eyebrow">eyebrow text</p>
    <h1 class="hero-title">Main Headline</h1>
    <p class="hero-subtitle">Supporting copy</p>
    <div class="hero-cta"><a href="#" class="btn-primary">Primary CTA</a><a href="#" class="btn-secondary">Secondary CTA</a></div>
  </div>
  <button class="carousel-prev">&#8592;</button>
  <button class="carousel-next">&#8594;</button>
  <div class="carousel-dots"><span class="dot active"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
</section>

CSS: .hero { position:relative; min-height:calc(100vh); padding-top:70px; box-sizing:border-box; overflow:hidden; } .carousel-track { position:absolute; inset:0; } .carousel-slide { position:absolute; inset:0; background-size:cover; background-position:center; opacity:0; transition:opacity 1.2s ease-in-out; } .carousel-slide.active { opacity:1; } .hero-overlay { position:absolute; inset:0; background:linear-gradient(135deg,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.3) 100%); z-index:1; } .hero-content { position:relative; z-index:2; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:80px 2rem 60px; } .hero-cta { margin-bottom:20px; } .carousel-prev,.carousel-next { position:absolute; top:50%; transform:translateY(-50%); z-index:3; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.3); color:white; width:48px; height:48px; border-radius:50%; cursor:pointer; font-size:18px; backdrop-filter:blur(4px); transition:all 0.2s; } .carousel-prev { left:2rem; } .carousel-next { right:2rem; } .carousel-dots { position:absolute; bottom:2rem; left:50%; transform:translateX(-50%); display:flex; gap:8px; z-index:3; } .dot { width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,0.4); cursor:pointer; transition:all 0.3s; } .dot.active { background:white; transform:scale(1.3); }

JavaScript: Add a <script> block that auto-advances slides every 5 seconds, handles prev/next button clicks, updates dot indicators, pauses on hover, and resumes on mouseleave. Use 4 DIFFERENT Unsplash photo IDs relevant to the subject.`;
    } else if (options.heroType === '3d') {
      userMessage += `

HERO SECTION REQUIREMENTS — 3D MOTION HERO:
Build a stunning 3D animated hero using an HTML5 Canvas element with pure JavaScript. NO THREE.JS. NO EXTERNAL LIBRARIES. Everything must work in a single HTML file.

Choose ONE canvas effect that best fits the brief's subject:
- PARTICLE FIELD (tech/space/digital): hundreds of 3D particles connected by lines, mouse tilt effect
- GEOMETRIC MORPHING (design/luxury/creative): rotating 3D wireframe polyhedron with glowing vertices
- WAVE SURFACE (audio/nature/wellness): undulating 3D grid of points colored by wave height
- DNA HELIX (science/health/bio): double helix of glowing spheres rotating in 3D space

HTML structure:
<section class="hero" id="hero">
  <canvas id="hero3d" class="hero-canvas"></canvas>
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <p class="hero-eyebrow">tagline text</p>
    <h1 class="hero-title">Main Headline</h1>
    <p class="hero-subtitle">Supporting copy</p>
    <div class="hero-cta"><a href="#" class="btn-primary">Primary CTA</a><a href="#" class="btn-secondary">Secondary CTA</a></div>
  </div>
</section>

CSS: .hero { position:relative; min-height:calc(100vh); padding-top:70px; box-sizing:border-box; overflow:hidden; background:var(--color-bg,#050a15); } .hero-canvas { position:absolute; inset:0; width:100%; height:100%; } .hero-overlay { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.4) 100%); } .hero-content { position:relative; z-index:2; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:80px 2rem 60px; }

JAVASCRIPT REQUIREMENTS: Write a COMPLETE working animation loop using requestAnimationFrame. For particle field example: const canvas=document.getElementById('hero3d'),ctx=canvas.getContext('2d'); let W,H,particles=[],mouse={x:0,y:0}; function resize(){W=canvas.width=canvas.offsetWidth;H=canvas.height=canvas.offsetHeight;} window.addEventListener('resize',resize); resize(); Create 150+ particles with x,y,z coordinates. Use perspective projection: scale=fov/(fov+z), screenX=W/2+x*scale, screenY=H/2+y*scale. Draw closer particles bigger and brighter. Connect particles within 100px with faint lines. Respond to mouse movement for camera tilt. Use requestAnimationFrame for 60fps. Colors MUST match the site's palette from the brief.

CRITICAL ANIMATION LOOP REQUIREMENTS — the animation MUST loop forever using this exact pattern, never breaking after the first frame:
let animationId = null;
function animate() {
  animationId = requestAnimationFrame(animate);
  ctx.clearRect(0, 0, W, H);
  // ... draw frame here ...
}
function startAnimation() {
  try { animate(); } catch(e) { console.error('Animation error:', e); }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startAnimation);
} else {
  startAnimation();
}
On resize, DO NOT cancel and restart the loop — only update dimensions:
window.addEventListener('resize', () => {
  W = canvas.width = canvas.offsetWidth;
  H = canvas.height = canvas.offsetHeight;
  // Do NOT call animate() again here — the loop is already running
});
NEVER call cancelAnimationFrame except when the page is hidden. Pause/resume with the Page Visibility API:
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  } else if (!animationId) {
    startAnimation();
  }
});
Write COMPLETE executable JavaScript — no pseudocode, no placeholders. The animation must actually run continuously and never silently stop.

CRITICAL: Write COMPLETE executable JavaScript — no pseudocode, no placeholders. The animation must actually run.`;
    }
  }

  // For iterations: append hero preserve instruction
  if (previousHtml && options.heroType) {
    const heroLabel = options.heroType === '3d' ? '3D canvas animation'
      : options.heroType === 'carousel' ? 'image carousel'
      : 'static background image';
    userMessage += `\n\nPRESERVE THE HERO TYPE: The current hero uses the ${heroLabel} style. Keep this exact hero type and only change what was requested.`;
  }

  // Color theme injection
  if (options.theme && options.theme.id !== 'auto') {
    const t = options.theme.colors || {};
    const customAcc = options.theme.customColor;

    userMessage += `

COLOR THEME — APPLY EXACTLY:
Use these CSS custom properties throughout:
:root {
  --color-primary: ${t.primary || customAcc || '#6366f1'};
  --color-accent: ${t.accent || customAcc || '#8b5cf6'};
  --color-bg: ${t.bg || '#050a15'};
  --color-surface: ${t.surface || '#0a1628'};
  --color-text: ${t.text || '#e0f4ff'};
}

Apply these tokens to ALL elements — backgrounds, buttons, borders, headings, accent lines, hover states. The entire site must feel cohesive with this palette. Do NOT use colors outside this token system except for very subtle neutrals.
`;
  }

  // Contact section injection
  if (options.contact) {
    const c = options.contact;
    userMessage += `

CONTACT SECTION — REQUIRED:
Add a complete contact section before the footer with:

${c.showForm ? `
CONTACT FORM:
<form class="contact-form">
  <div class="form-row">
    <input type="text" placeholder="Your Name" required>
    <input type="email" placeholder="Email Address" required>
  </div>
  <input type="text" placeholder="Subject">
  <textarea placeholder="Your message..." rows="5" required></textarea>
  <button type="submit">Send Message</button>
</form>
Form must have styled inputs matching the site's color theme.
` : ''}

CONTACT DETAILS:
${c.email ? `Email: ${c.email}` : ''}
${c.phone ? `Phone: ${c.phone}` : ''}
${c.address ? `Address: ${c.address}` : ''}

Style with icons (use Unicode or CSS): 📧 for email, 📞 for phone, 📍 for address

The section should have a heading like "Get In Touch" or "Contact Us" and use the site's accent color for highlights.
`;
  }

  console.log('[WebGen] Calling Claude API (single pass, max_tokens=16000)...');

  // ── Single-pass attempt ────────────────────────────────────────────────────
  const result = await callClaudeForWebsite(userMessage, WEBSITE_SYSTEM_PROMPT, 16000);

  // Diagnostic logging
  console.log('[WebGen] === DIAGNOSTIC ===');
  console.log('[WebGen] stop_reason:', result.stopReason);
  console.log('[WebGen] usage:', result.usage);
  console.log('[WebGen] Raw text length:', result.rawText.length);
  console.log('[WebGen] Last 200 chars:', result.rawText.substring(result.rawText.length - 200));
  console.log('[WebGen] Contains </html>:', result.rawText.toLowerCase().includes('</html>'));
  console.log('[WebGen] Contains </body>:', result.rawText.toLowerCase().includes('</body>'));
  console.log('[WebGen] === END DIAGNOSTIC ===');

  const isComplete =
    result.html.toLowerCase().includes('</html>') &&
    result.stopReason !== 'max_tokens';

  let finalHtml;

  if (isComplete) {
    console.log('[WebGen] Single pass complete.');
    finalHtml = extractHtml(result.html);
  } else {
    // ── Two-pass fallback ──────────────────────────────────────────────────
    console.warn(
      '[WebGen] Single pass incomplete (stop_reason: ' + result.stopReason +
      '), using two-pass generation'
    );

    const pass1Prompt = userMessage +
      `\n\nGenerate this website in TWO PARTS.\n` +
      `PART 1 (this response): Generate from <!DOCTYPE html> through the complete <head> section with all CSS, then the <body> opening, navigation, hero section, and about section. Do NOT close </body> or </html> yet — stop after the about section closes. This will be continued in part 2.`;

    console.log('[WebGen] Starting pass 1...');
    const pass1 = await callClaudeForWebsite(pass1Prompt, WEBSITE_SYSTEM_PROMPT, 16000);
    console.log('[WebGen] Pass 1 stop_reason:', pass1.stopReason, '| length:', pass1.html.length);

    const pass2Prompt =
      `Here is PART 1 of a website (head, nav, hero, about):\n\n` +
      `---PART 1---\n${pass1.html}\n---END PART 1---\n\n` +
      `Original brief: ${userPrompt}\n\n` +
      `Now generate PART 2 — the CONTINUATION: features/services section, gallery/showcase section with Unsplash images, testimonials section, call-to-action section, and footer. Then properly close </body></html>.\n\n` +
      `Output ONLY the new HTML continuing from where part 1 left off — do not repeat part 1, do not include <!DOCTYPE html> or <head> again. Start directly with the next section's HTML (e.g. starting with <section...).`;

    console.log('[WebGen] Starting pass 2...');
    const pass2 = await callClaudeForWebsite(pass2Prompt, WEBSITE_SYSTEM_PROMPT, 16000);
    console.log('[WebGen] Pass 2 stop_reason:', pass2.stopReason, '| length:', pass2.html.length);

    // Combine: strip trailing closing tags from pass1, append pass2
    let combined = pass1.html
      .replace(/<\/body>\s*<\/html>\s*$/i, '')
      .replace(/<\/html>\s*$/i, '');

    let pass2Clean = pass2.html
      .replace(/^```html?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    combined = combined + '\n' + pass2Clean;

    if (!combined.toLowerCase().includes('</body>')) combined += '\n</body>';
    if (!combined.toLowerCase().includes('</html>')) combined += '\n</html>';

    finalHtml = extractHtml(combined);
    console.log('[WebGen] Two-pass combined length:', finalHtml.length);
  }

  // Final sanity check
  if (!finalHtml.toLowerCase().includes('<html') || !finalHtml.toLowerCase().includes('<body')) {
    console.error('[WebGen] Invalid HTML preview:', finalHtml.substring(0, 200));
    throw new Error('Generated content is not valid HTML. Please try again with a more specific prompt.');
  }

  // Ensure closing tags exist
  if (!finalHtml.toLowerCase().includes('</html>')) {
    const lastBody = finalHtml.toLowerCase().lastIndexOf('</body>');
    if (lastBody > 0) {
      finalHtml = finalHtml.substring(0, lastBody + 7) + '\n</html>';
    } else {
      finalHtml += '\n</body>\n</html>';
    }
  }

  console.log('[WebGen] Final HTML length:', finalHtml.length, 'chars');
  return finalHtml;
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
