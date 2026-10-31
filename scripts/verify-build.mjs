import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('dist');
const origin = new URL(process.env.SITE_URL || 'https://guoqingwang1.github.io').origin;
const staticPages = [
  ['index.html', '/', 'zh-CN', '/en/'],
  ['publications/index.html', '/publications/', 'zh-CN', '/en/publications/'],
  ['blog/index.html', '/blog/', 'zh-CN', '/en/blog/'],
  ['en/index.html', '/en/', 'en', '/'],
  ['en/publications/index.html', '/en/publications/', 'en', '/publications/'],
  ['en/blog/index.html', '/en/blog/', 'en', '/blog/'],
];
const staticByFile = new Map(staticPages.map(page => [page[0], page]));
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map(match =>
    Object.fromEntries([...match[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map(([, key, double, single]) => [key.toLowerCase(), decode(double ?? single)])));
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
for (const required of [...staticByFile.keys(), '404.html', 'logo.svg', 'rss.xml', 'en/rss.xml', 'sitemap.xml', 'robots.txt']) await access(path.join(root, required));
const output = await files(root);
let pages = 0;
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
  const canonicals = links.filter(link => link.rel === 'canonical');
  assert.equal(canonicals.length, 1, `Expected one canonical: ${relative}`);
  assert.equal(new URL(canonicals[0].href).origin, origin, `Wrong canonical origin: ${relative}`);
  const known = staticByFile.get(relative);
  const isArticle = /^(?:en\/)?blog\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/.test(relative);
  assert(known || relative === '404.html' || isArticle, `Unrecognized HTML route: ${relative}`);
  const lang = relative.startsWith('en/') ? 'en' : 'zh-CN';
  assert.equal(tags(html, 'html')[0]?.lang, lang, `Wrong document language: ${relative}`);
  const alternates = links.filter(link => link.rel === 'alternate' && link.hreflang);
  const anchors = tags(html, 'a');
  if (known || isArticle) {
    const route = known ? known[1] : `/${relative.slice(0, -'index.html'.length)}`;
    assert.equal(canonicals[0].href, absolute(route), `Canonical must point to itself: ${relative}`);
    const home = lang === 'en' ? '/en/' : '/';
    const logo = anchors.find(anchor => hasClass(anchor, 'site-name'));
    assert(logo?.href && absolute(logo.href) === absolute(home), `Logo changes language: ${relative}`);
    const header = html.match(/<header\b[^>]*class="[^"]*\bsite-header\b[^"]*"[^>]*>([\s\S]*?)<\/header>/i);
    assert(header, `Missing shared header: ${relative}`);
    const navigation = tags(header[1], 'a').filter(anchor => !hasClass(anchor, 'language-switch'));
    for (const route of [home, `${home}publications/`, `${home}blog/`]) {
      assert(navigation.some(anchor => anchor.href && absolute(anchor.href) === absolute(route)), `Missing same-language navigation ${route}: ${relative}`);
    }
    const otherHome = lang === 'en' ? '/' : '/en/';
    for (const route of [otherHome, `${otherHome}publications/`, `${otherHome}blog/`]) {
      assert(!navigation.some(anchor => anchor.href && absolute(anchor.href) === absolute(route)), `Navigation crosses languages: ${relative}`);
    }
    const rss = links.filter(link => link.rel === 'alternate' && link.type === 'application/rss+xml');
    assert.equal(rss.length, 1, `Expected one RSS discovery link: ${relative}`);
    assert.equal(absolute(rss[0].href), absolute(`${home}rss.xml`), `RSS changes language: ${relative}`);
  }
  if (known) {
    const [, route, , otherRoute] = known;
    const zh = lang === 'zh-CN' ? route : otherRoute;
    const en = lang === 'en' ? route : otherRoute;
    assert.equal(alternates.length, 3, `Expected zh-CN/en/x-default alternates: ${relative}`);
    for (const [locale, route] of [['zh-CN', zh], ['en', en], ['x-default', zh]]) {
      const matches = alternates.filter(link => link.hreflang === locale);
      assert.equal(matches.length, 1, `Missing or duplicate ${locale}: ${relative}`);
      assert.equal(matches[0].href, absolute(route), `Wrong ${locale} alternate: ${relative}`);
    }
    const switches = anchors.filter(anchor => hasClass(anchor, 'language-switch'));
    assert.equal(switches.length, 1, `Expected one language switch: ${relative}`);
    assert.equal(absolute(switches[0].href), absolute(otherRoute), `Language switch loses current page: ${relative}`);
  } else if (isArticle) {
    assert.equal(alternates.length, 0, `Article must not advertise an unprovided translation: ${relative}`);
  }
  for (const match of text.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const value = match[1];
    if (/^(?:https?:|data:|mailto:|tel:|#)/.test(value)) continue;
    const pathname = decodeURIComponent(value.split(/[?#]/)[0]);
    if (!pathname) continue;
    let target = pathname.startsWith('/') ? path.join(root, pathname) : path.resolve(path.dirname(filename), pathname);
    assert(target.startsWith(root + path.sep), `Link escapes output: ${value}`);
    if (pathname.endsWith('/')) target = path.join(target, 'index.html');
    await access(target).catch(() => { throw new Error(`Broken internal link in ${relative}: ${value}`); });
  }
}
const robots = await readFile(path.join(root,'robots.txt'),'utf8');
assert(robots.includes(`${origin}/sitemap.xml`));
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
for (const [, route] of staticPages) assert(sitemapUrls.includes(absolute(route)), `Sitemap omits ${route}`);
assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, 'Duplicate sitemap URLs');
assert(pages >= 7, 'Missing bilingual static pages or root 404');
console.log(`Verified ${pages} HTML pages and ${output.length} output files: bilingual routes, language links, canonical/hreflang, RSS discovery, and public-output boundaries.`);
