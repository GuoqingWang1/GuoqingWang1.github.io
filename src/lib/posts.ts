import { getCollection, type CollectionEntry } from 'astro:content';
import { localizedPath, type Locale } from './i18n';
import relatedPostKeys from '../data/related-posts.json';
const publicationDateFormat = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});
export function formatPostDate(date: Date) {
  const parts = Object.fromEntries(publicationDateFormat.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export async function publishedPosts(lang?: Locale) {
  const now = Date.now();
  const posts = await getCollection('blog', ({ data }) => !data.draft && data.pubDate.getTime() <= now);
  const routes = new Set<string>();
  for (const post of posts) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.id)) {
      throw new Error(`Post filename/slug must be lowercase words separated by hyphens: ${post.id}`);
    }
    const route = postPath(post);
    if (routes.has(route)) throw new Error(`Duplicate published article language: ${route}`);
    routes.add(route);
  }
  return posts.filter(post => !lang || post.data.lang === lang).sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime() || (a.data.order ?? 0) - (b.data.order ?? 0) || postKey(a).localeCompare(postKey(b)) || a.data.lang.localeCompare(b.data.lang));
}
type RoutablePost = { id: string; data: { lang: Locale; translationKey?: string } };
export function postKey(post: RoutablePost) {
  return post.data.translationKey ?? post.id;
}
export async function translationsForPost(post: CollectionEntry<'blog'>) {
  return (await publishedPosts()).filter(candidate => postKey(candidate) === postKey(post));
}
export async function relatedPosts(post: CollectionEntry<'blog'>) {
  const keys = (relatedPostKeys as Record<string, string[]>)[postKey(post)] ?? [];
  const available = new Map((await publishedPosts(post.data.lang)).map(candidate => [postKey(candidate), candidate]));
  return keys.filter(key => key !== postKey(post)).map(key => available.get(key)).filter((candidate): candidate is CollectionEntry<'blog'> => Boolean(candidate));
}
export function readingMinutes(body = '') {
  body = body.replace(/<\/?[a-z][^>]*>/gi, ' ');
  const cjk = (body.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (body.replace(/[\u3400-\u9fff]/g, ' ').match(/[a-zA-Z0-9]+/g) || []).length;
  return Math.max(1, Math.ceil(cjk / 350 + words / 220));
}

export function postPath(post: RoutablePost) {
  return localizedPath(`/blog/${postKey(post)}/`, post.data.lang);
}
