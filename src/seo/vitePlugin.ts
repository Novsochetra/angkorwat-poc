import { basename } from 'node:path';
import type { HtmlTagDescriptor, Plugin } from 'vite';

/** The share picture: the world map at night (public/; its size and how to make one: CLAUDE.md). */
const SHARE_IMAGE = 'og-night.jpg';
const SHARE_ALT = 'A voxel map of the Angkor highlands at night: Angkor Wat lit gold under the full moon, jungle, waterfalls and lantern paths.';

/**
 * Search and share tags for the world map (index.html). The words (title,
 * description) are in index.html; this adds the tags that need the site's full
 * address, which crawlers and chat apps want: the canonical link, the share
 * picture and the structured data (JSON-LD), and at build `robots.txt` and
 * `sitemap.xml`. The address is SITE_URL in .env (e.g. https://angkor.example.com);
 * without it the picture is relative and there is no canonical link or sitemap.
 */
export function seoPlugin(siteUrl = ''): Plugin {
  const site = siteUrl.trim().replace(/\/+$/, '');
  const url = (path = '') => (site ? `${site}/${path}` : `./${path}`);
  return {
    name: 'angkor-seo',
    transformIndexHtml(html, ctx): HtmlTagDescriptor[] | undefined {
      if (basename(ctx.filename) !== 'index.html') return;
      const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
      const meta = (property: string, content: string): HtmlTagDescriptor => ({
        tag: 'meta',
        attrs: { [property.startsWith('og:') ? 'property' : 'name']: property, content },
        injectTo: 'head',
      });
      const data = {
        '@context': 'https://schema.org',
        '@type': 'VideoGame',
        name: 'Angkor Heritage',
        alternateName: 'មរតកអង្គរ',
        description,
        ...(site && { url: url() }),
        image: url(SHARE_IMAGE),
        genre: ['Adventure', 'Exploration'],
        gamePlatform: 'Web browser',
        applicationCategory: 'Game',
        operatingSystem: 'Any',
        inLanguage: ['km', 'en'],
        playMode: 'SinglePlayer',
      };
      return [
        ...(site
          ? [{ tag: 'link', attrs: { rel: 'canonical', href: url() }, injectTo: 'head' } as const, meta('og:url', url())]
          : []),
        // (the picture's size and words follow it: they belong to the og:image before them)
        meta('og:image', url(SHARE_IMAGE)),
        meta('og:image:type', 'image/jpeg'),
        meta('og:image:width', '1200'),
        meta('og:image:height', '630'),
        meta('og:image:alt', SHARE_ALT),
        meta('twitter:image', url(SHARE_IMAGE)),
        meta('twitter:image:alt', SHARE_ALT),
        // (`<` escaped: the JSON cannot close the script)
        { tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(data).replace(/</g, '\\u003c'), injectTo: 'head' },
      ];
    },
    generateBundle() {
      const robots = `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${url('sitemap.xml')}\n` : ''}`;
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      if (site)
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url()}</loc></url>\n</urlset>\n`,
        });
    },
  };
}
