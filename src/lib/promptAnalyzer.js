// promptAnalyzer.js — extracts layout, theme, colors, style, industry, and features from a user prompt.

export function analyzePrompt(userPrompt) {
  const prompt = userPrompt.toLowerCase();

  // DETECT LAYOUT TYPE
  const layoutType = (() => {
    if (prompt.includes('dashboard') || prompt.includes('admin') || prompt.includes('analytics') ||
        prompt.includes('panel') || prompt.includes('crm') || prompt.includes('metrics') ||
        prompt.includes('kpi') || prompt.includes('reporting'))
      return 'dashboard';
    if (prompt.includes('portfolio') || prompt.includes('personal site') || prompt.includes('my work') ||
        prompt.includes('showcase') || prompt.includes('case study') || prompt.includes('projects'))
      return 'portfolio';
    if (prompt.includes('landing page') || prompt.includes('saas') || prompt.includes('startup') ||
        prompt.includes('app landing') || prompt.includes('waitlist') || prompt.includes('launch page'))
      return 'landing';
    if (prompt.includes('restaurant') || prompt.includes('cafe') || prompt.includes('food') ||
        prompt.includes('menu') || prompt.includes('bistro') || prompt.includes('dining'))
      return 'restaurant';
    if (prompt.includes('agency') || prompt.includes('studio') || prompt.includes('creative') ||
        prompt.includes('design firm') || prompt.includes('branding'))
      return 'agency';
    if (prompt.includes('ecommerce') || prompt.includes('e-commerce') || prompt.includes('shop') ||
        prompt.includes('store') || prompt.includes('product page') || prompt.includes('pricing page'))
      return 'ecommerce';
    if (prompt.includes('blog') || prompt.includes('article') || prompt.includes('editorial') ||
        prompt.includes('magazine') || prompt.includes('news'))
      return 'blog';
    if (prompt.includes('event') || prompt.includes('conference') || prompt.includes('meetup') ||
        prompt.includes('wedding') || prompt.includes('concert'))
      return 'event';
    return 'landing';
  })();

  // DETECT THEME
  const theme = (() => {
    if (prompt.includes('light theme') || prompt.includes('light mode') || prompt.includes('white background') ||
        prompt.includes('clean white') || prompt.includes('minimal white') || prompt.includes('bright'))
      return 'light';
    if (prompt.includes('dark theme') || prompt.includes('dark mode') || prompt.includes('dark background') ||
        prompt.includes('night mode') || prompt.includes('black'))
      return 'dark';
    return 'dark';
  })();

  // DETECT COLORS
  const colorMap = {
    purple:  { accent1: '#8b5cf6', accent2: '#7c3aed', gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed, #6d28d9)' },
    violet:  { accent1: '#7c3aed', accent2: '#6d28d9', gradient: 'linear-gradient(135deg, #7c3aed, #6d28d9)' },
    blue:    { accent1: '#3b82f6', accent2: '#2563eb', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)' },
    cyan:    { accent1: '#06b6d4', accent2: '#0891b2', gradient: 'linear-gradient(135deg, #06b6d4, #0891b2, #0e7490)' },
    teal:    { accent1: '#14b8a6', accent2: '#0d9488', gradient: 'linear-gradient(135deg, #14b8a6, #0d9488)' },
    green:   { accent1: '#22c55e', accent2: '#16a34a', gradient: 'linear-gradient(135deg, #22c55e, #16a34a, #15803d)' },
    emerald: { accent1: '#10b981', accent2: '#059669', gradient: 'linear-gradient(135deg, #10b981, #059669)' },
    orange:  { accent1: '#f97316', accent2: '#ea580c', gradient: 'linear-gradient(135deg, #f97316, #ea580c, #c2410c)' },
    red:     { accent1: '#ef4444', accent2: '#dc2626', gradient: 'linear-gradient(135deg, #ef4444, #dc2626, #b91c1c)' },
    pink:    { accent1: '#ec4899', accent2: '#db2777', gradient: 'linear-gradient(135deg, #ec4899, #db2777, #be185d)' },
    rose:    { accent1: '#f43f5e', accent2: '#e11d48', gradient: 'linear-gradient(135deg, #f43f5e, #e11d48)' },
    yellow:  { accent1: '#eab308', accent2: '#ca8a04', gradient: 'linear-gradient(135deg, #eab308, #ca8a04)' },
    gold:    { accent1: '#f59e0b', accent2: '#d97706', gradient: 'linear-gradient(135deg, #f59e0b, #d97706, #b45309)' },
    indigo:  { accent1: '#6366f1', accent2: '#4f46e5', gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899)' },
    neon:    { accent1: '#00ff88', accent2: '#00d4ff', gradient: 'linear-gradient(135deg, #00ff88, #00d4ff)' },
    matrix:  { accent1: '#00ff41', accent2: '#00cc33', gradient: 'linear-gradient(135deg, #00ff41, #00cc33)' },
    white:   { accent1: '#ffffff', accent2: '#e5e7eb', gradient: 'linear-gradient(135deg, #ffffff, #e5e7eb)' },
  };

  const colors = (() => {
    for (const [name, val] of Object.entries(colorMap)) {
      if (prompt.includes(name)) return val;
    }
    if (layoutType === 'restaurant') return colorMap['gold'];
    if (layoutType === 'agency') return { accent1: '#FFE600', accent2: '#ffffff', gradient: 'linear-gradient(135deg, #FFE600, #ffffff)' };
    if (layoutType === 'portfolio') return colorMap['cyan'];
    if (layoutType === 'dashboard') return colorMap['blue'];
    return colorMap['indigo'];
  })();

  // DETECT VISUAL STYLE
  const visualStyle = (() => {
    if (prompt.includes('minimal') || prompt.includes('clean') || prompt.includes('simple') ||
        prompt.includes('elegant') || prompt.includes('subtle'))
      return 'minimal';
    if (prompt.includes('3d') || prompt.includes('three.js') || prompt.includes('three d') ||
        prompt.includes('dimensional') || prompt.includes('depth'))
      return '3d';
    if (prompt.includes('retro') || prompt.includes('vintage') || prompt.includes('old school') ||
        prompt.includes('nostalgic') || prompt.includes('grain'))
      return 'retro';
    if (prompt.includes('glassmorphism') || prompt.includes('glass') || prompt.includes('frosted') ||
        prompt.includes('blur'))
      return 'glass';
    if (prompt.includes('neon') || prompt.includes('cyberpunk') || prompt.includes('futuristic') ||
        prompt.includes('tron') || prompt.includes('glow'))
      return 'neon';
    if (prompt.includes('bold') || prompt.includes('dramatic') || prompt.includes('powerful') ||
        prompt.includes('strong') || prompt.includes('impactful'))
      return 'bold';
    return 'bold';
  })();

  // DETECT INDUSTRY
  const industry = (() => {
    if (prompt.includes('tech') || prompt.includes('software') || prompt.includes('saas') ||
        prompt.includes('ai') || prompt.includes('startup'))
      return 'tech';
    if (prompt.includes('finance') || prompt.includes('banking') || prompt.includes('fintech') ||
        prompt.includes('investment') || prompt.includes('crypto'))
      return 'finance';
    if (prompt.includes('health') || prompt.includes('medical') || prompt.includes('fitness') ||
        prompt.includes('wellness') || prompt.includes('hospital'))
      return 'health';
    if (prompt.includes('education') || prompt.includes('learning') || prompt.includes('course') ||
        prompt.includes('school') || prompt.includes('university'))
      return 'education';
    if (prompt.includes('real estate') || prompt.includes('property') || prompt.includes('housing') ||
        prompt.includes('architecture'))
      return 'realestate';
    if (prompt.includes('fashion') || prompt.includes('clothing') || prompt.includes('apparel') ||
        prompt.includes('luxury'))
      return 'fashion';
    if (prompt.includes('travel') || prompt.includes('hotel') || prompt.includes('tourism') ||
        prompt.includes('destination'))
      return 'travel';
    return 'general';
  })();

  // DETECT FEATURES
  const features = {
    wantsParticles:    prompt.includes('particle') || prompt.includes('particles'),
    wants3DHero:       prompt.includes('3d') || prompt.includes('three.js'),
    wantsCharts:       prompt.includes('chart') || prompt.includes('graph') ||
                       prompt.includes('analytics') || layoutType === 'dashboard',
    wantsPricing:      prompt.includes('pricing') || prompt.includes('plans') ||
                       prompt.includes('subscription') || layoutType === 'landing',
    wantsPortfolio:    layoutType === 'portfolio',
    wantsForm:         prompt.includes('contact') || prompt.includes('form') ||
                       prompt.includes('booking') || prompt.includes('reservation'),
    wantsMenu:         layoutType === 'restaurant',
    wantsTestimonials: prompt.includes('testimonial') || prompt.includes('review') ||
                       prompt.includes('feedback'),
    wantsBlog:         prompt.includes('blog') || prompt.includes('articles') || prompt.includes('posts'),
    wantsMap:          prompt.includes('location') || prompt.includes('map') || prompt.includes('address'),
    wantsCounter:      prompt.includes('stats') || prompt.includes('numbers') || prompt.includes('metrics'),
    wantsTimeline:     prompt.includes('timeline') || prompt.includes('history') || prompt.includes('journey'),
    wantsFAQ:          prompt.includes('faq') || prompt.includes('questions') ||
                       prompt.includes('how it works'),
    wantsNewsletter:   prompt.includes('newsletter') || prompt.includes('subscribe') ||
                       prompt.includes('email list'),
    multiPage:         prompt.includes('multi page') || prompt.includes('multiple pages') ||
                       prompt.includes('about page') || prompt.includes('contact page'),
  };

  // EXTRACT BRAND NAME
  const nameMatch =
    userPrompt.match(/["']([^"']+)["']/) ||
    userPrompt.match(/called\s+(\w+)/i) ||
    userPrompt.match(/named\s+(\w+)/i) ||
    userPrompt.match(/for\s+([A-Z][a-zA-Z]+)/);
  const brandName = nameMatch ? nameMatch[1] : null;

  return { layoutType, theme, colors, visualStyle, industry, features, brandName, originalPrompt: userPrompt };
}
