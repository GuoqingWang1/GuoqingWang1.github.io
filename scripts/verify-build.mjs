import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('dist');
const origin = new URL(process.env.SITE_URL || 'https://guoqingwang1.github.io').origin;
const news = JSON.parse(await readFile('src/data/news.json', 'utf8'));
const publications = JSON.parse(await readFile('src/data/publications.json', 'utf8'));
const staticPages = [
  ['index.html', '/', 'en'],
  ['publications/index.html', '/publications/', 'en'],
  ['blog/index.html', '/blog/', 'en'],
  ['zh/index.html', '/zh/', 'zh-CN'],
  ['zh/publications/index.html', '/zh/publications/', 'zh-CN'],
  ['zh/blog/index.html', '/zh/blog/', 'zh-CN'],
];
const translationPairs = [['/', '/zh/'], ['/publications/', '/zh/publications/'], ['/blog/', '/zh/blog/']];
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
    ...tags(match[0], 'a')[0], text: decode(match[1].replace(/<[^>]*>/g, '')).trim(), raw: match[0],
  }));
}
function paperEntries(html) {
  return [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)]
    .filter(match => hasClass(tags(match[0], 'article')[0], 'publication'))
    .map(match => ({ markup: match[0], ...tags(match[0], 'article')[0] }));
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
const renderedPapers = new Map();
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
    assert.equal(tags(header[0], 'header')[0].lang, lang, `Wrong header language: ${relative}`);
    const headerAnchors = anchorEntries(header[1]);
    const headerSwitches = headerAnchors.filter(anchor => hasClass(anchor, 'language-switch'));
    const logo = headerAnchors.find(anchor => hasClass(anchor, 'site-name'));
    const home = lang === 'zh-CN' ? '/zh/' : '/';
    assert(logo?.href && absolute(logo.href) === absolute(home), `Logo must point to its own-language homepage: ${relative}`);
    const nav = header[1].match(/<nav\b[^>]*id="main-navigation"[^>]*>([\s\S]*?)<\/nav>/i);
    assert(nav, `Missing main navigation: ${relative}`);
    const labels = lang === 'zh-CN' ? ['关于', '论文', '博客'] : ['About', 'Publications', 'Blog'];
    assert.deepEqual(anchorEntries(nav[1]).map(anchor => [anchor.text, absolute(anchor.href)]),
      labels.map((label, index) => [label, absolute([home, `${home}publications/`, `${home}blog/`][index])]),
      `Wrong localized navigation: ${relative}`);
    const social = headerAnchors.filter(anchor => /^(?:https?:|mailto:)/.test(anchor.href || ''));
    assert.equal(social.length, 3, `Expected GitHub, Scholar and email header links: ${relative}`);
    assert(social.some(anchor => anchor.href === 'https://github.com/GuoqingWang1' && anchor['aria-label'] === 'GitHub'), `Missing GitHub header link: ${relative}`);
    assert(social.some(anchor => anchor.href?.includes('scholar.google.com/citations?') && new URL(anchor.href).searchParams.get('user') === 'D6vayD4AAAAJ' && anchor['aria-label'] === (lang === 'zh-CN' ? '谷歌学术' : 'Google Scholar')), `Wrong localized Scholar header link: ${relative}`);
    assert(social.some(anchor => anchor.href === 'mailto:guoqingwang905@gmail.com' && anchor['aria-label'] === `${lang === 'zh-CN' ? '邮箱' : 'Email'}: guoqingwang905@gmail.com`), `Wrong localized email header link: ${relative}`);
    const rss = links.filter(link => link.rel === 'alternate' && link.type === 'application/rss+xml');
    assert.equal(rss.length, 1, `Expected one RSS discovery link: ${relative}`);
    assert.equal(absolute(rss[0].href), absolute(lang === 'zh-CN' ? '/zh/rss.xml' : '/rss.xml'), `Wrong RSS discovery: ${relative}`);
    if (known || isArticle) {
      assert.equal(switches.length, 1, `Expected exactly one page language switch: ${relative}`);
      assert.equal(headerSwitches.length, 1, `Language switch must be in the header: ${relative}`);
      const otherLang = lang === 'zh-CN' ? 'en' : 'zh-CN';
      assert.equal(switches[0].lang, otherLang, `Wrong language-switch text language: ${relative}`);
      assert.equal(switches[0].hreflang, otherLang, `Wrong language-switch target language: ${relative}`);
      assert.equal(switches[0].text, lang === 'zh-CN' ? 'EN' : '中文', `Wrong compact language-switch label: ${relative}`);
      if (isArticle) {
        const otherList = lang === 'zh-CN' ? '/blog/' : '/zh/blog/';
        const otherBlog = lang === 'zh-CN' ? 'English blog' : '中文博客';
        assert.equal(absolute(switches[0].href), absolute(otherList), `Article switch invents a translation: ${relative}`);
        assert.equal(switches[0]['aria-label'], otherBlog, `Article switch must describe the other Blog list: ${relative}`);
        assert.equal(switches[0].title, otherBlog, `Article switch tooltip must describe the other Blog list: ${relative}`);
        assert(!/\bdata-equivalent\b/.test(switches[0].raw), `Article must not claim an equivalent translation: ${relative}`);
      } else {
        const pair = translationPairs.find(routes => routes.includes(known[1]));
        assert.equal(absolute(switches[0].href), absolute(pair[lang === 'en' ? 1 : 0]), `Switch must target the equivalent page: ${relative}`);
        assert(switches[0]['aria-label'] && switches[0].title, `Language switch lacks accessible description: ${relative}`);
      }
    } else {
      assert.equal(switches.length, 0, `404 must not display a language switch: ${relative}`);
    }
    if (known) {
      const [enRoute, zhRoute] = translationPairs.find(routes => routes.includes(known[1]));
      assert.equal(alternates.length, 3, `Expected en/zh-CN/x-default page alternates: ${relative}`);
      for (const [locale, route] of [['en', enRoute], ['zh-CN', zhRoute], ['x-default', enRoute]]) {
        const matches = alternates.filter(link => link.hreflang === locale);
        assert.equal(matches.length, 1, `Missing or duplicate ${locale}: ${relative}`);
        assert.equal(matches[0].href, absolute(route), `Wrong ${locale} alternate: ${relative}`);
      }
    } else {
      assert.equal(alternates.length, 0, `Page advertises an unprovided translation: ${relative}`);
    }
  }
  if (['index.html', 'zh/index.html'].includes(relative)) {
    const elements = tags(html, '[a-z][a-z0-9:-]*');
    assert(elements.some(element => element.id === 'news'), 'Homepage lacks #news');
    assert.equal(elements.filter(element => hasClass(element, 'news-item')).length, news.length, 'Homepage must include every verified News item');
  }
  if (['index.html', 'zh/index.html', 'publications/index.html', 'zh/publications/index.html'].includes(relative)) {
    const papers = paperEntries(html);
    const isHome = relative === 'index.html' || relative === 'zh/index.html';
    assert.equal(papers.length, isHome ? publications.selected.length : publications.papers.length, `Wrong paper count: ${relative}`);
    assert(papers.every(paper => paper.lang === 'en'), `Publication records must remain marked as English: ${relative}`);
    assert.equal(new Set(papers.map(paper => paper.id)).size, papers.length, `Duplicate paper entries: ${relative}`);
    if (isHome) assert.deepEqual(papers.map(paper => paper.id), publications.selected, `Selected paper order differs from the curated list: ${relative}`);
    renderedPapers.set(relative, papers.map(paper => paper.markup));
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
for (const [en, zh] of [['index.html', 'zh/index.html'], ['publications/index.html', 'zh/publications/index.html']]) {
  assert.deepEqual(renderedPapers.get(zh), renderedPapers.get(en), `Paper order and complete English records must match across UI languages: ${en}`);
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
assert.equal(pages, 10 + articleCount, 'Expected six bilingual main pages, root 404, three redirects, and published articles');
console.log(`Verified ${pages} HTML pages and ${output.length} output files: localized headers and language switches, identical English publication records, bilingual News/Blog, canonical/legacy redirects, RSS compatibility, and public-output boundaries.`);
