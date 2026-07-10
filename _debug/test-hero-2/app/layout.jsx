// Root layout — injects theme tokens from content/site.json as CSS variables so
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
  return `${r} ${g} ${b}`;
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

  const themeVars = `:root {
    --color-primary: ${hexToRgbChannels(colors.primary)};
    --color-accent: ${hexToRgbChannels(colors.accent)};
    --color-bg: ${hexToRgbChannels(colors.bg)};
    --color-surface: ${hexToRgbChannels(colors.surface)};
    --color-text: ${hexToRgbChannels(colors.text)};
    --font-heading: '${fonts.heading}', sans-serif;
    --font-body: '${fonts.body}', sans-serif;
  }`;

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
