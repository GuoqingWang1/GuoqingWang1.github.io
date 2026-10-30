import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { publishedPosts } from '../lib/posts';
import { profile } from '../data/profile';
export async function GET(context: APIContext) {
  const posts = await publishedPosts();
  return rss({
    title: `${profile.name} — Blog`, description: profile.description, site: context.site!,
    items: posts.map(post => ({ title: post.data.title, description: post.data.description, pubDate: post.data.pubDate, link: `/blog/${post.id}/` })),
  });
}
