import { mkdir, mkdtemp, readFile, readdir, writeFile, unlink, rm, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const content = path.resolve('src/content/blog');
const work = path.resolve(process.env.VERIFY_WORK_DIR || '.verify-work');
const origin = new URL(process.env.SITE_URL || 'https://guoqingwang1.github.io').origin;
let temporary;
const languages = [
  { lang: 'zh-CN', key: 'zh', home: '/zh/', otherHome: '/' },
  { lang: 'en', key: 'en', home: '/', otherHome: '/zh/' },
];
const fixtures = [...languages.flatMap(language => [
  { ...language, name: `verification-published-${language.key}`, status: `draft: false\nreview: true\nslug: verification-public-${language.key}`, date: '2000-01-01T18:30:00Z', marker: `__VERIFICATION_PUBLIC_${language.key.toUpperCase()}__`, published: true },
  ...[
    ['draft', 'draft: true\nreview: true', '2000-01-01'],
    ['default', 'review: true', '2000-01-01'],
    ['future', 'draft: false', '2999-01-01'],
  ].map(([kind, status, date]) => ({
    ...language, name: `verification-${kind}-${language.key}`, status, date,
    marker: `__VERIFICATION_PRIVATE_${kind.toUpperCase()}_${language.key.toUpperCase()}__`, published: false,
    translationKey: `verification-public-${language.key === 'en' ? 'zh' : 'en'}`,
  })),
]), ...languages.map(language => ({
  ...language, name: `verification-paired-${language.key}`, status: 'draft: false\nreview: true',
  date: '2000-01-01T18:30:00Z', marker: `__VERIFICATION_PAIRED_${language.key.toUpperCase()}__`,
  published: true, paired: true, translationKey: 'verification-paired',
  headings: language.lang === 'zh-CN' ? ['中文第一节', '中文第二节'] : ['First English section', 'Second English section'],
}))];
const created = [];
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map(match =>
    Object.fromEntries([...match[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map(([, key, double, single]) => [key.toLowerCase(), decode(double ?? single)])));
}
const hasClass = (tag, name) => (tag.class || '').split(/\s+/).includes(name);
const absolute = value => new URL(value, origin).href;
const fixtureKey = fixture => fixture.translationKey ?? `verification-public-${fixture.key}`;
const fixtureBody = fixture => fixture.lang === 'zh-CN'
  ? '这是用于验证发布边界的临时中文内容，不是真实文章。'
  : 'Synthetic English content for publication-boundary verification, never a real article.';
function renderedH2(html) {
  return [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(match => ({
    id: tags(match[0], 'h2')[0].id,
    text: decode(match[1].replace(/<[^>]*>/g, '')).trim(),
  }));
}
function publishedLinks(text, filename) {
  if (filename.endsWith('.html')) return tags(text, 'a').filter(anchor => hasClass(anchor, 'blog-entry')).map(anchor => absolute(anchor.href));
  return [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match => {
    const link = match[1].match(/<link>([^<]+)<\/link>/)?.[1];
    assert(link, 'RSS item lacks a canonical article link');
    return absolute(decode(link));
  });
}
function assertArticleAlternates(html, key, route) {
  const alternates = tags(html, 'link').filter(link => link.rel === 'alternate' && link.hreflang);
  const expected = [['en', `/blog/${key}/`], ['zh-CN', `/zh/blog/${key}/`], ['x-default', `/blog/${key}/`]];
  assert.equal(alternates.length, expected.length, `Expected three article language alternates: ${route}`);
  for (const [lang, destination] of expected) {
    const matches = alternates.filter(link => link.hreflang === lang);
    assert.equal(matches.length, 1, `Missing or duplicate ${lang} article alternate: ${route}`);
    assert.equal(absolute(matches[0].href), absolute(destination), `Wrong ${lang} article alternate: ${route}`);
  }
}
function assertLocalizedHeader(html, { lang, home, otherHome }, route, { article = false, translationRoute } = {}) {
  const header = html.match(/<header\b[^>]*class="[^"]*\bsite-header\b[^"]*"[^>]*>([\s\S]*?)<\/header>/i);
  assert(header, `Missing article header: ${route}`);
  assert.equal(tags(header[0], 'header')[0].lang, lang, `Wrong header language: ${route}`);
  const anchors = [...header[1].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map(match => ({
    ...tags(match[0], 'a')[0], text: decode(match[1].replace(/<[^>]*>/g, '')).trim(), raw: match[0],
  }));
  const logo = anchors.find(anchor => hasClass(anchor, 'site-name'));
  assert(logo?.href && absolute(logo.href) === absolute(home), `Header logo changes UI language: ${route}`);
  const labels = lang === 'zh-CN' ? ['关于', '论文', '博客'] : ['About', 'Publications', 'Blog'];
  const nav = header[1].match(/<nav\b[^>]*id="main-navigation"[^>]*>([\s\S]*?)<\/nav>/i);
  assert(nav, `Missing localized main navigation: ${route}`);
  const navLinks = [...nav[1].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map(match => [decode(match[1].replace(/<[^>]*>/g, '')).trim(), absolute(tags(match[0], 'a')[0].href)]);
  assert.deepEqual(navLinks, labels.map((label, index) => [label, absolute([home, `${home}publications/`, `${home}blog/`][index])]), `Wrong localized navigation: ${route}`);
  const switches = anchors.filter(anchor => hasClass(anchor, 'language-switch'));
  const expectedSwitches = article && !translationRoute ? 0 : 1;
  assert.equal(switches.length, expectedSwitches, `Wrong number of header language switches: ${route}`);
  assert.equal(tags(html, 'a').filter(anchor => hasClass(anchor, 'language-switch')).length, expectedSwitches, `Wrong number of page language switches: ${route}`);
  if (!expectedSwitches) return null;
  assert.equal(absolute(switches[0].href), absolute(translationRoute ?? `${otherHome}blog/`), `Language switch must target the paired article or equivalent list: ${route}`);
  assert.equal(switches[0].text, lang === 'zh-CN' ? 'EN' : '中文', `Wrong compact switch label: ${route}`);
  assert.equal(switches[0].lang, lang === 'zh-CN' ? 'en' : 'zh-CN', `Wrong switch text language: ${route}`);
  assert.equal(switches[0].hreflang, lang === 'zh-CN' ? 'en' : 'zh-CN', `Wrong switch target language: ${route}`);
  if (article) {
    const description = lang === 'zh-CN' ? 'Read this article in English' : '阅读本文中文版';
    assert.equal(switches[0]['aria-label'], description, `Article switch must describe the same article: ${route}`);
    assert.equal(switches[0].title, description, `Article switch tooltip must describe the same article: ${route}`);
    assert(/\bdata-article-translation\b/.test(switches[0].raw), `Article switch lacks translation behavior marker: ${route}`);
    assert(!/\bdata-equivalent\b/.test(switches[0].raw), `Article must use translated anchor mapping rather than copying the source hash: ${route}`);
    assert(switches[0]['data-anchor-map'], `Article switch lacks an anchor map: ${route}`);
  }
  return switches[0];
}
async function allText(dir) {
  let text = '';
  for (const entry of await readdir(dir, { withFileTypes:true })) {
    const name = path.join(dir,entry.name);
    if(entry.isDirectory()) text += await allText(name);
    else if(/\.(html|xml|txt|js|json|css|map|md)$/.test(name)) text += await readFile(name,'utf8');
  }
  return text;
}
try {
  await mkdir(work,{recursive:true});
  temporary = await mkdtemp(path.join(work, 'content-'));
  const output = path.join(temporary, 'dist');
  for(const fixture of fixtures) {
    const {name,status,date,marker,lang,translationKey} = fixture;
    const target=path.join(content,`${name}.md`);
    const body = fixtureBody(fixture);
    const [firstHeading, secondHeading] = fixture.headings ?? ['First section', 'Second section'];
    const translation = translationKey ? `translationKey: ${translationKey}\n` : '';
    const markdown=`---\ntitle: "${marker}"\ndescription: "Temporary content-pipeline verification fixture."\npubDate: ${date}\ncategory: technical\nlang: ${lang}\n${translation}${status}\n---\n\n## ${firstHeading}\n\n${body}\n\n## ${secondHeading}\n\n\`\`\`python\nprint("fixture")\n\`\`\`\n`;
    await writeFile(target,markdown,{flag:'wx'});created.push(target);
  }
  const run=spawnSync('npm',['run','build','--','--outDir',output],{encoding:'utf8',env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'}});
  assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
  const combined=await allText(output);
  for(const {marker,published} of fixtures) if (!published) assert(!combined.includes(marker),`Unpublished content leaked in any language: ${marker}`);
  const sitemap = await readFile(path.join(output, 'sitemap.xml'), 'utf8');
  const legacyFeed = await readFile(path.join(output, 'en/rss.xml'), 'utf8');
  assert(legacyFeed.includes('<language>en</language>'), 'Legacy RSS must remain English');
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
  assert(!sitemapUrls.some(url => new URL(url).pathname.startsWith('/en/')), 'Legacy aliases leaked into sitemap');
  for (const fixture of fixtures.filter(f => f.published)) {
    const { lang, key, home, otherHome, marker } = fixture;
    const slug = fixtureKey(fixture);
    const route = `${home}blog/${slug}/`;
    const article = await readFile(path.join(output, route.slice(1), 'index.html'), 'utf8');
    assert(article.includes(marker), `Published ${lang} fixture missing`);
    assert(article.includes(fixtureBody(fixture)), `Published ${lang} article has the wrong body`);
    assert(new RegExp(`<html\\b[^>]*lang="${lang}"`).test(article), `Wrong article language: ${route}`);
    const headings = renderedH2(article);
    assert.deepEqual(headings.map(heading => heading.text), fixture.headings ?? ['First section', 'Second section'], `Article headings changed language or order: ${route}`);
    for (const heading of headings) assert(heading.id && tags(article, 'a').some(anchor => anchor.href === `#${heading.id}`), `Article TOC missing ${heading.id}: ${route}`);
    assert(article.includes('<pre'), `Code block was not rendered: ${route}`);
    assert(article.includes('datetime="2000-01-01T18:30:00.000Z">2000-01-02</time>'), `Article date must use Asia/Shanghai: ${route}`);
    assert(article.includes(`class="article-review">${lang === 'zh-CN' ? '初稿' : 'Draft'}</span>`), `Public review status missing: ${route}`);
    const canonical = article.match(/<link\b(?=[^>]*rel="canonical")(?=[^>]*href="([^"]+)")[^>]*>/);
    assert.equal(canonical?.[1], `${origin}${route}`, `Wrong article canonical: ${route}`);
    assert(new RegExp(`<a\\b(?=[^>]*class="[^"]*\\barticle-back\\b)(?=[^>]*href="${home}blog/")[^>]*>`).test(article), `Article back link changes language: ${route}`);
    const translationRoute = fixture.paired ? `${otherHome}blog/${slug}/` : undefined;
    const switchLink = assertLocalizedHeader(article, fixture, route, { article: true, translationRoute });
    const rss = tags(article, 'link').filter(link => link.rel === 'alternate' && link.type === 'application/rss+xml');
    assert.equal(rss.length, 1, `Missing article RSS discovery: ${route}`);
    assert.equal(absolute(rss[0].href), absolute(`${home}rss.xml`), `Article points to the wrong feed: ${route}`);
    if (fixture.paired) {
      assertArticleAlternates(article, slug, route);
      assert(tags(article, 'article').some(tag => tag['data-translation-key'] === slug), `Article lacks the shared translation identity: ${route}`);
      const otherFixture = fixtures.find(candidate => candidate.paired && candidate.lang !== lang);
      const otherArticle = await readFile(path.join(output, translationRoute.slice(1), 'index.html'), 'utf8');
      assert(otherArticle.includes(otherFixture.marker) && !otherArticle.includes(marker), `Paired article body/title is not language-isolated: ${route}`);
      assert(otherArticle.includes(fixtureBody(otherFixture)) && !otherArticle.includes(fixtureBody(fixture)), `Paired article uses the wrong language body: ${route}`);
      const otherHeadings = renderedH2(otherArticle);
      assert.deepEqual(otherHeadings.map(heading => heading.text), otherFixture.headings, `Paired headings differ from their language: ${route}`);
      assert.notDeepEqual(headings.map(heading => heading.id), otherHeadings.map(heading => heading.id), 'Pair fixture must exercise translated, different anchor IDs');
      assert.deepEqual(JSON.parse(switchLink['data-anchor-map']), Object.fromEntries(headings.map((heading, index) => [heading.id, otherHeadings[index].id])), `Wrong translated H2 anchor mapping: ${route}`);
      await assert.rejects(access(path.join(output, `${home}blog/${fixture.name}/`.slice(1), 'index.html')), { code: 'ENOENT' }, `Filename leaked into a paired canonical route: ${fixture.name}`);
      const sitemapEntry = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].find(match => match[1].includes(`<loc>${origin}${route}</loc>`))?.[1];
      assert(sitemapEntry, `Sitemap omits the paired article: ${route}`);
      const alternates = tags(sitemapEntry, 'xhtml:link');
      assert.equal(alternates.length, 3, `Sitemap lacks article alternates: ${route}`);
      for (const [locale, destination] of [['en', `/blog/${slug}/`], ['zh-CN', `/zh/blog/${slug}/`], ['x-default', `/blog/${slug}/`]]) {
        assert.equal(alternates.filter(link => link.hreflang === locale && link.href === absolute(destination)).length, 1, `Wrong sitemap ${locale} article alternate: ${route}`);
      }
    } else {
      assert(!/<link\b[^>]*hreflang=/.test(article), `Hidden or future translation advertised: ${route}`);
      await assert.rejects(access(path.join(output, `${otherHome}blog/${slug}/`.slice(1), 'index.html')), { code: 'ENOENT' }, `Hidden or future translated article was generated: ${slug}`);
      const sitemapEntry = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].find(match => match[1].includes(`<loc>${origin}${route}</loc>`))?.[1];
      assert(sitemapEntry && !/hreflang=/.test(sitemapEntry), `Sitemap advertises a hidden or future translation: ${route}`);
    }
    await assert.rejects(access(path.join(output, 'en/blog', slug, 'index.html')), { code: 'ENOENT' }, `Unprovided legacy article was generated: ${slug}`);
    for (const name of ['blog/index.html', 'rss.xml']) {
      const own = await readFile(path.join(output, home.slice(1), name), 'utf8');
      const other = await readFile(path.join(output, otherHome.slice(1), name), 'utf8');
      assert(own.includes(marker), `Published ${lang} fixture missing from ${home}${name}`);
      assert(publishedLinks(own, name).includes(absolute(route)), `Published route missing from ${home}${name}`);
      assert(!other.includes(marker) && !publishedLinks(other, name).includes(absolute(route)), `${lang} article leaked into the other-language ${name}`);
      if (name === 'blog/index.html') {
        assertLocalizedHeader(own, fixture, `${home}blog/`);
        assert(own.includes('datetime="2000-01-01T18:30:00.000Z">2000-01-02</time>'), `Blog date must use Asia/Shanghai: ${home}`);
      }
      if (name === 'rss.xml') assert(own.includes(`<language>${lang}</language>`), `Wrong feed language: ${home}rss.xml`);
    }
    assert.equal(legacyFeed.includes(marker), lang === 'en', `Legacy RSS contains the wrong language: ${lang}`);
    if (lang === 'en') {
      assert(publishedLinks(legacyFeed, 'rss.xml').includes(absolute(route)), 'Legacy RSS must link to the canonical English article route');
      assert(!legacyFeed.includes(`/en/blog/${slug}/`), 'Legacy RSS retains an obsolete article URL');
    }
    assert(sitemap.includes(`${origin}${route}`), `Sitemap omits published ${lang} article`);
  }
  for (const fixture of fixtures.filter(f => !f.published)) {
    for (const home of ['/', '/zh/', '/en/']) {
      await assert.rejects(access(path.join(output, `${home}blog/${fixture.name}/`.slice(1), 'index.html')), { code: 'ENOENT' }, `Unpublished route generated: ${fixture.name}`);
    }
  }
  console.log('Content boundaries passed: ten fixtures; published translations share canonical keys, reciprocal article switches and H2 anchor maps; hidden/future translations stay undiscoverable; Asia/Shanghai dates, public draft labels, language-isolated bodies/lists/feeds and legacy English RSS remain correct.');
} finally {
  const cleanup = await Promise.allSettled([
    ...created.map(target => unlink(target)),
    ...(temporary ? [rm(temporary, { recursive: true, force: true })] : []),
  ]);
  const failures = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, 'Failed to clean content verification fixtures');
}
