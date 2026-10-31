import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { publishedPosts, postPath } from './posts';
import { copy, localizedPath, type Locale } from './i18n';
import { profile } from '../data/profile';

export async function feed(context: APIContext, lang: Locale) {
  const posts = await publishedPosts(lang);
  return rss({
    title: `${profile.name} — ${copy[lang].blog}`,
    description: copy[lang].blogDescription,
    site: new URL(localizedPath('/blog/', lang), context.site),
    customData: `<language>${lang}</language>`,
    items: posts.map(post => ({ title: post.data.title, description: post.data.description, pubDate: post.data.pubDate, link: new URL(postPath(post), context.site).href })),
  });
}
