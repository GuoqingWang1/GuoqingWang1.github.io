import { getCollection } from 'astro:content';
export async function publishedPosts() {
  const now = Date.now();
  const posts = await getCollection('blog', ({ data }) => !data.draft && data.pubDate.getTime() <= now);
  for (const post of posts) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.id)) {
      throw new Error(`Post filename/slug must be lowercase words separated by hyphens: ${post.id}`);
    }
  }
  return posts.sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime() || a.id.localeCompare(b.id));
}
export function readingMinutes(body = '') {
  const cjk = (body.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (body.replace(/[\u3400-\u9fff]/g, ' ').match(/[a-zA-Z0-9]+/g) || []).length;
  return Math.max(1, Math.ceil(cjk / 350 + words / 220));
}
