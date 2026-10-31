import type { APIContext } from 'astro';
import { publishedPosts } from '../lib/posts';
export async function GET({ site }: APIContext) {
  const posts = await publishedPosts();
  const urls = [new URL('/', site).href, new URL('/blog/', site).href, new URL('/publications/', site).href, ...posts.map(p => new URL(`/blog/${p.id}/`, site).href)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<url><loc>${url.replace(/&/g, '&amp;')}</loc></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
