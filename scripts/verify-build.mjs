import { readFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('dist');
const origin = new URL(process.env.SITE_URL || 'https://guoqingwang1.github.io').origin;
const news = JSON.parse(await readFile('src/data/news.json', 'utf8'));
const publications = JSON.parse(await readFile('src/data/publications.json', 'utf8'));
const relatedPostKeys = JSON.parse(await readFile('src/data/related-posts.json', 'utf8'));
const exampleAssets = JSON.parse(await readFile('src/data/example-assets.json', 'utf8'));
const shareImages = JSON.parse(await readFile('src/data/share-images.json', 'utf8'));
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
function imageInfo(bytes) {
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    assert.equal(bytes.readUInt32BE(8), 13, 'Invalid PNG IHDR length');
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', 'PNG lacks its first IHDR chunk');
    return { type: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset < bytes.length) {
      assert.equal(bytes[offset], 0xff, 'Invalid JPEG marker');
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      assert(offset < bytes.length, 'Truncated JPEG marker');
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      assert(offset + 2 <= bytes.length, 'Truncated JPEG segment');
      const length = bytes.readUInt16BE(offset);
      assert(length >= 2 && offset + length <= bytes.length, 'Invalid JPEG segment length');
      if (frameMarkers.has(marker)) {
        assert(length >= 8, 'Truncated JPEG frame header');
        return { type: 'image/jpeg', width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
      }
      offset += length;
    }
    throw new Error('JPEG lacks an image frame header');
  }
  throw new Error('Share image must contain a PNG or JPEG raster');
}
assert.deepEqual(Object.keys(shareImages).sort(), ['en', 'zh-CN'], 'Expected English and Chinese share-image manifests');
for (const [lang, image] of Object.entries(shareImages)) {
  assert(/^\/social\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:png|jpe?g)$/.test(image.path), `Invalid share-image path: ${lang}`);
  assert(['image/png', 'image/jpeg'].includes(image.type), `Unsupported share-image MIME type: ${lang}`);
  assert(image.type === (/\.png$/.test(image.path) ? 'image/png' : 'image/jpeg'), `Share-image suffix/MIME mismatch: ${lang}`);
  assert.equal(image.width, 1200, `Share-image width must be 1200: ${lang}`);
  assert.equal(image.height, 630, `Share-image height must be 630: ${lang}`);
  assert(typeof image.alt === 'string' && image.alt.trim(), `Missing share-image description: ${lang}`);
  assert(/^[a-f0-9]{64}$/.test(image.sha256), `Invalid share-image SHA256: ${lang}`);
  assert(image.path.includes(image.sha256.slice(0, 8)), `Share-image filename must contain its content hash: ${lang}`);
  const bytes = await readFile(path.join(root, image.path.slice(1)));
  assert(bytes.length < 5_000_000, `Share image exceeds the project's 5 MB compatibility target: ${lang}`);
  assert.deepEqual(imageInfo(bytes), { type: image.type, width: image.width, height: image.height }, `Share-image binary metadata disagrees with manifest: ${lang}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256, `Share-image content hash mismatch: ${lang}`);
}
function verifyShareMetadata(metas, lang, canonical, relative) {
  const value = (attribute, key) => {
    const matching = metas.filter(meta => meta[attribute] === key);
    assert.equal(matching.length, 1, `Expected exactly one ${key}: ${relative}`);
    assert(matching[0].content, `Empty ${key}: ${relative}`);
    return matching[0].content;
  };
  const image = shareImages[lang];
  const imageUrl = absolute(image.path);
  assert.equal(new URL(imageUrl).protocol, 'https:', `Share-image URL must use HTTPS: ${relative}`);
  value('property', 'og:title');
  value('property', 'og:type');
  assert.equal(value('property', 'og:url'), canonical, `Open Graph URL differs from canonical: ${relative}`);
  for (const [key, expected] of Object.entries({
    'og:image': imageUrl, 'og:image:secure_url': imageUrl, 'og:image:type': image.type,
    'og:image:width': String(image.width), 'og:image:height': String(image.height), 'og:image:alt': image.alt,
  })) assert.equal(value('property', key), expected, `Wrong ${key}: ${relative}`);
  assert.equal(value('name', 'twitter:card'), 'summary_large_image', `Wrong X card type: ${relative}`);
  assert.equal(value('name', 'twitter:image'), imageUrl, `Wrong X card image: ${relative}`);
  assert.equal(value('name', 'twitter:image:alt'), image.alt, `Wrong X card image description: ${relative}`);
}
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
for (const asset of exampleAssets) {
  assert(/^\/examples\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(asset.path), `Invalid example asset path: ${asset.path}`);
  const bytes = await readFile(path.join(root, asset.path.slice(1)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `Example asset hash mismatch: ${asset.path}`);
}
const renderedPapers = new Map();
const blogCatalogs = new Map();
let pages = 0, articleCount = 0;
for (const filename of output) {
  const relative = path.relative(root, filename);
  assert(!/(^|\/)(editorial|work|node_modules|src|\.git)(\/|$)/.test(relative), `Source directory leaked: ${relative}`);
  if (!/\.(html|js|css|xml|txt|svg|json|map|md|py)$/.test(filename)) continue;
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
  const articleEnRoute = isArticle ? `/${relative.replace(/^zh\//, '').replace(/index\.html$/, '')}` : undefined;
  const articlePair = isArticle ? [articleEnRoute, `/zh${articleEnRoute}`] : undefined;
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
    verifyShareMetadata(metas, lang, canonicals[0].href, relative);
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
        const otherRoute = articlePair[lang === 'en' ? 1 : 0];
        const label = lang === 'zh-CN' ? 'Read this article in English' : '阅读本文中文版';
        assert.equal(absolute(switches[0].href), absolute(otherRoute), `Article switch must stay on the same article: ${relative}`);
        assert.equal(switches[0]['aria-label'], label, `Article switch must describe its translation: ${relative}`);
        assert.equal(switches[0].title, label, `Article translation tooltip: ${relative}`);
        assert(/\bdata-article-translation\b/.test(switches[0].raw), `Missing article-translation marker: ${relative}`);
        const otherHtml = await readFile(path.join(root, otherRoute.slice(1), 'index.html'), 'utf8');
        const key = articleEnRoute.split('/')[2];
        assert.equal(tags(html, 'article')[0]['data-translation-key'], key, `Wrong shared article key: ${relative}`);
        assert.equal(tags(otherHtml, 'article')[0]['data-translation-key'], key, `Counterpart belongs to a different article: ${relative}`);
        const sourceHeadings = tags(html, 'h2').filter(heading => heading.id).map(heading => heading.id);
        const targetHeadings = tags(otherHtml, 'h2').filter(heading => heading.id).map(heading => heading.id);
        const anchorMap = JSON.parse(switches[0]['data-anchor-map']);
        assert.deepEqual(Object.keys(anchorMap), sourceHeadings, `Missing source section mapping: ${relative}`);
        assert.deepEqual(Object.values(anchorMap), targetHeadings, `Wrong translated section mapping: ${relative}`);
      } else {
        const pair = translationPairs.find(routes => routes.includes(known[1]));
        assert.equal(absolute(switches[0].href), absolute(pair[lang === 'en' ? 1 : 0]), `Switch must target the equivalent page: ${relative}`);
        assert(switches[0]['aria-label'] && switches[0].title, `Language switch lacks accessible description: ${relative}`);
      }
    } else {
      assert.equal(switches.length, 0, `404 must not display a language switch: ${relative}`);
    }
    if (known || isArticle) {
      const [enRoute, zhRoute] = isArticle ? articlePair : translationPairs.find(routes => routes.includes(known[1]));
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
  if (isArticle) {
    const key = articleEnRoute.split('/')[2];
    const expectedKeys = relatedPostKeys[key];
    assert(expectedKeys?.length >= 1 && expectedKeys.length <= 2, `Expected one or two related notes: ${key}`);
    assert(new Set(expectedKeys).size === expectedKeys.length && !expectedKeys.includes(key), `Duplicate/self related note: ${key}`);
    const relatedLinks = anchors.filter(anchor => anchor['data-related-key']);
    assert.deepEqual(relatedLinks.map(anchor => anchor['data-related-key']), expectedKeys, `Wrong related-note order: ${relative}`);
    for (const anchor of relatedLinks) {
      const route = `${lang === 'zh-CN' ? '/zh' : ''}/blog/${anchor['data-related-key']}/`;
      assert.equal(anchor.href, route, `Related note must stay in the same language: ${relative}`);
      assert.equal(anchor.lang, lang, `Related-note title language: ${relative}`);
      const target = await readFile(path.join(root, route.slice(1), 'index.html'), 'utf8');
      const title = decode(target.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1].replace(/<[^>]*>/g, '') || '').trim();
      assert.equal(anchor.text, title, `Related-note title differs from its target: ${relative}`);
    }
  }
  if (['blog/index.html', 'zh/blog/index.html'].includes(relative)) {
    const entries = anchors.filter(anchor => hasClass(anchor, 'blog-entry'));
    const keys = entries.map(entry => entry['data-post-key']);
    assert(keys.every(Boolean) && new Set(keys).size === keys.length, `Each article must appear once in the Blog catalog: ${relative}`);
    blogCatalogs.set(relative, keys);
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
assert.deepEqual(blogCatalogs.get('blog/index.html'), blogCatalogs.get('zh/blog/index.html'), 'Both Blog languages must show the same articles in the same order');
assert.deepEqual(Object.keys(relatedPostKeys).sort(), [...blogCatalogs.get('blog/index.html')].sort(), 'Related-note map must cover the published catalog exactly');
assert.equal(articleCount, 2 * blogCatalogs.get('blog/index.html').length, 'Every public article must have one English and one Chinese version');
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
