import type { APIContext } from 'astro';
import { publishedPosts, postPath } from '../lib/posts';
import { locales, localizedPath } from '../lib/i18n';
export async function GET({ site }: APIContext) {
  const posts = await publishedPosts();
  const absolute = (path: string) => new URL(path, site).href.replace(/&/g, '&amp;');
  const pages = ['/', '/publications/', '/blog/'].flatMap(path => locales.map(lang => {
    const alternates = locales.map(locale => `<xhtml:link rel="alternate" hreflang="${locale}" href="${absolute(localizedPath(path, locale))}"/>`).join('');
    return `<url><loc>${absolute(localizedPath(path, lang))}</loc>${alternates}<xhtml:link rel="alternate" hreflang="x-default" href="${absolute(path)}"/></url>`;
  }));
  const articles = posts.map(post => `<url><loc>${absolute(postPath(post))}</loc></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${[...pages, ...articles].join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
