import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('dist');
const origin = new URL(process.env.SITE_URL || 'https://guoqingwang1.github.io').origin;
const staticPages = [
  ['index.html', '/', 'en'],
  ['publications/index.html', '/publications/', 'en'],
  ['blog/index.html', '/blog/', 'en'],
  ['zh/blog/index.html', '/zh/blog/', 'zh-CN'],
];
const aliases = new Map([
  ['en/index.html', '/'],
  ['en/publications/index.html', '/publications/'],
  ['en/blog/index.html', '/blog/'],
]);
const staticByFile = new Map(staticPages.map(page => [page[0], page]));
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map(match =>
    Object.fromEntries([...match[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map(([, key, double, single]) => [key.toLowerCase(), decode(double ?? single)])));
}
function anchorEntries(html) {
  return [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map(match => ({
    ...tags(match[0], 'a')[0], text: decode(match[1].replace(/<[^>]*>/g, '')).trim(),
  }));
}
const hasClass = (tag, name) => (tag.class || '').split(/\s+/).includes(name);
const absolute = value => new URL(value, origin).href;
async function files(dir) {
  const list = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected symlink in output: ${name}`);
    list.push(...(entry.isDirectory() ? await files(name) : [name]));
  }
  return list;
}
for (const required of [...staticByFile.keys(), ...aliases.keys(), '404.html', 'logo.svg', 'rss.xml', 'zh/rss.xml', 'en/rss.xml', 'sitemap.xml', 'robots.txt']) {
  await access(path.join(root, required));
}
const output = await files(root);
let pages = 0, articleCount = 0;
for (const filename of output) {
  const relative = path.relative(root, filename);
  assert(!/(^|\/)(editorial|work|node_modules|src|\.git)(\/|$)/.test(relative), `Source directory leaked: ${relative}`);
  if (!/\.(html|js|css|xml|txt|svg|json|map|md)$/.test(filename)) continue;
  const text = await readFile(filename, 'utf8');
  assert(!/(\/Users\/|file:\/\/|localhost:\d|127\.0\.0\.1|FIRST_NEW_UPDATES|native-attempt|__VERIFICATION_)/.test(text), `Unexpected local/private/test marker in ${relative}`);
  if (!filename.endsWith('.html')) continue;
  pages++;
  assert(/<title>[^<]+<\/title>/.test(text), `Missing page title: ${relative}`);
  const html = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const links = tags(html, 'link');
  const metas = tags(html, 'meta');
  const canonicals = links.filter(link => link.rel === 'canonical');
  assert.equal(canonicals.length, 1, `Expected one canonical: ${relative}`);
  assert.equal(new URL(canonicals[0].href).origin, origin, `Wrong canonical origin: ${relative}`);
  const known = staticByFile.get(relative);
  const alias = aliases.get(relative);
  const isArticle = /^(?:zh\/)?blog\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/.test(relative);
  const isBlog = isArticle || relative === 'blog/index.html' || relative === 'zh/blog/index.html';
  assert(known || alias || relative === '404.html' || isArticle, `Unrecognized HTML route: ${relative}`);
  if (isArticle) articleCount++;
  const lang = relative.startsWith('zh/') ? 'zh-CN' : 'en';
  assert.equal(tags(html, 'html')[0]?.lang, lang, `Wrong document language: ${relative}`);
  const alternates = links.filter(link => link.rel === 'alternate' && link.hreflang);
  const anchors = anchorEntries(html);
  const switches = anchors.filter(anchor => hasClass(anchor, 'language-switch'));
  if (alias) {
    assert.equal(canonicals[0].href, absolute(alias), `Legacy alias canonical: ${relative}`);
    const refresh = metas.filter(meta => meta['http-equiv']?.toLowerCase() === 'refresh');
    assert.equal(refresh.length, 1, `Legacy alias lacks refresh: ${relative}`);
    const target = refresh[0].content?.match(/^\s*\d+(?:\.\d+)?\s*;\s*url\s*=\s*["']?([^"']+)["']?\s*$/i)?.[1]?.trim();
    assert(target && absolute(target) === absolute(alias), `Legacy alias refresh target: ${relative}`);
    assert(metas.some(meta => meta.name?.toLowerCase() === 'robots' && /\bnoindex\b/i.test(meta.content || '')), `Legacy alias must be noindex: ${relative}`);
    assert.equal(alternates.length, 0, `Legacy alias must not advertise translations: ${relative}`);
    assert.equal(switches.length, 0, `Legacy alias must not display a language switch: ${relative}`);
  } else {
    if (known || isArticle) {
      const route = known ? known[1] : `/${relative.slice(0, -'index.html'.length)}`;
      assert.equal(canonicals[0].href, absolute(route), `Canonical must point to itself: ${relative}`);
    }
    const header = html.match(/<header\b[^>]*class="[^"]*\bsite-header\b[^"]*"[^>]*>([\s\S]*?)<\/header>/i);
    assert(header, `Missing shared header: ${relative}`);
    const navigation = anchorEntries(header[1]).filter(anchor => !hasClass(anchor, 'language-switch'));
    const logo = navigation.find(anchor => hasClass(anchor, 'site-name'));
    assert(logo?.href && absolute(logo.href) === absolute('/'), `Logo must point to English homepage: ${relative}`);
    const blogPath = lang === 'zh-CN' ? '/zh/blog/' : '/blog/';
    for (const [label, route] of [['About', '/'], ['News', '/#news'], ['Publications', '/publications/'], ['Blog', blogPath]]) {
      assert(navigation.some(anchor => anchor.text === label && anchor.href && absolute(anchor.href) === absolute(route)), `Missing English navigation ${label} → ${route}: ${relative}`);
    }
    assert(!navigation.some(anchor => anchor.href && new URL(anchor.href, origin).origin === origin && /^\/(?:en\/|zh\/(?!blog\/))/.test(new URL(anchor.href, origin).pathname)), `Header links to a legacy or translated non-Blog page: ${relative}`);
    const rss = links.filter(link => link.rel === 'alternate' && link.type === 'application/rss+xml');
    assert.equal(rss.length, 1, `Expected one RSS discovery link: ${relative}`);
    assert.equal(absolute(rss[0].href), absolute(lang === 'zh-CN' ? '/zh/rss.xml' : '/rss.xml'), `Wrong RSS discovery: ${relative}`);
    if (isBlog) {
      const otherList = lang === 'zh-CN' ? '/blog/' : '/zh/blog/';
      assert.equal(switches.length, 1, `Expected one Blog language switch: ${relative}`);
      assert.equal(absolute(switches[0].href), absolute(otherList), `Blog switch must target the other-language list: ${relative}`);
    } else {
      assert.equal(switches.length, 0, `Non-Blog page must not display a language switch: ${relative}`);
    }
    if (isBlog && !isArticle) {
      assert.equal(alternates.length, 3, `Expected en/zh-CN/x-default Blog alternates: ${relative}`);
      for (const [locale, route] of [['en', '/blog/'], ['zh-CN', '/zh/blog/'], ['x-default', '/blog/']]) {
        const matches = alternates.filter(link => link.hreflang === locale);
        assert.equal(matches.length, 1, `Missing or duplicate ${locale}: ${relative}`);
        assert.equal(matches[0].href, absolute(route), `Wrong ${locale} alternate: ${relative}`);
      }
    } else {
      assert.equal(alternates.length, 0, `Page advertises an unprovided translation: ${relative}`);
    }
  }
  if (relative === 'index.html') {
    const elements = tags(html, '[a-z][a-z0-9:-]*');
    assert(elements.some(element => element.id === 'news'), 'Homepage lacks #news');
    assert.equal(elements.filter(element => hasClass(element, 'news-item')).length, 3, 'Homepage must contain three verified News items');
  }
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const value = decode(match[1]);
    if (/^(?:https?:|data:|mailto:|tel:|#)/.test(value)) continue;
    const pathname = decodeURIComponent(value.split(/[?#]/)[0]);
    if (!pathname) continue;
    let target = pathname.startsWith('/') ? path.join(root, pathname) : path.resolve(path.dirname(filename), pathname);
    assert(target.startsWith(root + path.sep), `Link escapes output: ${value}`);
    if (pathname.endsWith('/')) target = path.join(target, 'index.html');
    await access(target).catch(() => { throw new Error(`Broken internal link in ${relative}: ${value}`); });
  }
}
const robots = await readFile(path.join(root, 'robots.txt'), 'utf8');
assert(robots.includes(`${origin}/sitemap.xml`));
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
for (const [, route] of staticPages) assert(sitemapUrls.includes(absolute(route)), `Sitemap omits ${route}`);
assert(!sitemapUrls.some(url => new URL(url).pathname.startsWith('/en/')), 'Sitemap includes a legacy alias');
assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, 'Duplicate sitemap URLs');
const feeds = await Promise.all(['rss.xml', 'zh/rss.xml', 'en/rss.xml'].map(name => readFile(path.join(root, name), 'utf8')));
for (const [index, lang] of [[0, 'en'], [1, 'zh-CN'], [2, 'en']]) assert(feeds[index].includes(`<language>${lang}</language>`), `Wrong feed language: ${index}`);
const feedItems = xml => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match => match[1]);
assert.deepEqual(feedItems(feeds[2]), feedItems(feeds[0]), 'Legacy English RSS does not match the canonical feed');
assert.equal(pages, 8 + articleCount, 'Expected four main pages, root 404, three redirects, and published articles');
console.log(`Verified ${pages} HTML pages and ${output.length} output files: English navigation, bilingual Blog, News, canonical/legacy redirects, RSS compatibility, and public-output boundaries.`);
