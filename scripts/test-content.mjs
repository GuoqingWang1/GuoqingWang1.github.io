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
const fixtures = languages.flatMap(language => [
  { ...language, name: `verification-published-${language.key}`, status: `draft: false\nreview: true\nslug: verification-public-${language.key}`, date: '2000-01-01T18:30:00Z', marker: `__VERIFICATION_PUBLIC_${language.key.toUpperCase()}__`, published: true },
  ...[
    ['draft', 'draft: true\nreview: true', '2000-01-01'],
    ['default', 'review: true', '2000-01-01'],
    ['future', 'draft: false', '2999-01-01'],
  ].map(([kind, status, date]) => ({ ...language, name: `verification-${kind}-${language.key}`, status, date, marker: `__VERIFICATION_PRIVATE_${kind.toUpperCase()}_${language.key.toUpperCase()}__`, published: false })),
]);
const created = [];
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map(match =>
    Object.fromEntries([...match[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map(([, key, double, single]) => [key.toLowerCase(), decode(double ?? single)])));
}
const hasClass = (tag, name) => (tag.class || '').split(/\s+/).includes(name);
const absolute = value => new URL(value, origin).href;
function assertLocalizedHeader(html, { lang, home, otherHome }, route, { article = false } = {}) {
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
  assert.equal(switches.length, 1, `Language switch must appear exactly once in the header: ${route}`);
  assert.equal(tags(html, 'a').filter(anchor => hasClass(anchor, 'language-switch')).length, 1, `Duplicate language switch outside the header: ${route}`);
  assert.equal(absolute(switches[0].href), absolute(`${otherHome}blog/`), `Blog language switch invents a translated article: ${route}`);
  assert.equal(switches[0].text, lang === 'zh-CN' ? 'EN' : '中文', `Wrong compact switch label: ${route}`);
  assert.equal(switches[0].lang, lang === 'zh-CN' ? 'en' : 'zh-CN', `Wrong switch text language: ${route}`);
  assert.equal(switches[0].hreflang, lang === 'zh-CN' ? 'en' : 'zh-CN', `Wrong switch target language: ${route}`);
  if (article) {
    const otherBlog = lang === 'zh-CN' ? 'English blog' : '中文博客';
    assert.equal(switches[0]['aria-label'], otherBlog, `Article switch must name the other-language Blog list: ${route}`);
    assert.equal(switches[0].title, otherBlog, `Article switch tooltip must name the other-language Blog list: ${route}`);
    assert(!/\bdata-equivalent\b/.test(switches[0].raw), `Article falsely claims an equivalent translation: ${route}`);
  }
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
  for(const {name,status,date,marker,lang} of fixtures) {
    const target=path.join(content,`${name}.md`);
    const body = lang === 'zh-CN' ? '这是用于验证发布边界的临时中文内容，不是真实文章。' : 'Synthetic English content for publication-boundary verification, never a real article.';
    const markdown=`---\ntitle: "${marker}"\ndescription: "Temporary content-pipeline verification fixture."\npubDate: ${date}\ncategory: technical\nlang: ${lang}\n${status}\n---\n\n## First section\n\n${body}\n\n## Second section\n\n\`\`\`python\nprint("fixture")\n\`\`\`\n`;
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
    const slug = `verification-public-${key}`;
    const route = `${home}blog/${slug}/`;
    const article = await readFile(path.join(output, route.slice(1), 'index.html'), 'utf8');
    assert(article.includes(marker), `Published ${lang} fixture missing`);
    assert(new RegExp(`<html\\b[^>]*lang="${lang}"`).test(article), `Wrong article language: ${route}`);
    assert(article.includes('href="#first-section"'), `Article TOC missing: ${route}`);
    assert(article.includes('<pre'), `Code block was not rendered: ${route}`);
    assert(article.includes('datetime="2000-01-01T18:30:00.000Z">2000-01-02</time>'), `Article date must use Asia/Shanghai: ${route}`);
    assert(article.includes(`class="article-review">${lang === 'zh-CN' ? '初稿' : 'Draft'}</span>`), `Public review status missing: ${route}`);
    const canonical = article.match(/<link\b(?=[^>]*rel="canonical")(?=[^>]*href="([^"]+)")[^>]*>/);
    assert.equal(canonical?.[1], `${origin}${route}`, `Wrong article canonical: ${route}`);
    assert(!/<link\b[^>]*hreflang=/.test(article), `Article advertises a nonexistent translation: ${route}`);
    assert(new RegExp(`<a\\b(?=[^>]*class="[^"]*\\barticle-back\\b)(?=[^>]*href="${home}blog/")[^>]*>`).test(article), `Article back link changes language: ${route}`);
    assertLocalizedHeader(article, fixture, route, { article: true });
    const rss = tags(article, 'link').filter(link => link.rel === 'alternate' && link.type === 'application/rss+xml');
    assert.equal(rss.length, 1, `Missing article RSS discovery: ${route}`);
    assert.equal(absolute(rss[0].href), absolute(`${home}rss.xml`), `Article points to the wrong feed: ${route}`);
    await assert.rejects(access(path.join(output, `${otherHome}blog/${slug}/`.slice(1), 'index.html')), { code: 'ENOENT' }, `Unprovided translated article was generated: ${slug}`);
    await assert.rejects(access(path.join(output, 'en/blog', slug, 'index.html')), { code: 'ENOENT' }, `Unprovided legacy article was generated: ${slug}`);
    for (const name of ['blog/index.html', 'rss.xml']) {
      const own = await readFile(path.join(output, home.slice(1), name), 'utf8');
      const other = await readFile(path.join(output, otherHome.slice(1), name), 'utf8');
      assert(own.includes(marker), `Published ${lang} fixture missing from ${home}${name}`);
      assert(own.includes(route), `Published route missing from ${home}${name}`);
      assert(!other.includes(marker) && !other.includes(route), `${lang} article leaked into the other-language ${name}`);
      if (name === 'blog/index.html') {
        assertLocalizedHeader(own, fixture, `${home}blog/`);
        assert(own.includes('datetime="2000-01-01T18:30:00.000Z">2000-01-02</time>'), `Blog date must use Asia/Shanghai: ${home}`);
      }
      if (name === 'rss.xml') assert(own.includes(`<language>${lang}</language>`), `Wrong feed language: ${home}rss.xml`);
    }
    assert.equal(legacyFeed.includes(marker), lang === 'en', `Legacy RSS contains the wrong language: ${lang}`);
    if (lang === 'en') {
      assert(legacyFeed.includes(route), 'Legacy RSS must link to the canonical English article route');
      assert(!legacyFeed.includes(`/en/blog/${slug}/`), 'Legacy RSS retains an obsolete article URL');
    }
    assert(sitemap.includes(`${origin}${route}`), `Sitemap omits published ${lang} article`);
  }
  for (const fixture of fixtures.filter(f => !f.published)) {
    for (const home of ['/', '/zh/', '/en/']) {
      await assert.rejects(access(path.join(output, `${home}blog/${fixture.name}/`.slice(1), 'index.html')), { code: 'ENOENT' }, `Unpublished route generated: ${fixture.name}`);
    }
  }
  console.log('Content boundaries passed: localized navigation and one header switch to the other-language Blog list; independent English/Chinese article routes, lists and feeds; compatible legacy English RSS; no unpublished content, invented translations or obsolete article routes.');
} finally {
  const cleanup = await Promise.allSettled([
    ...created.map(target => unlink(target)),
    ...(temporary ? [rm(temporary, { recursive: true, force: true })] : []),
  ]);
  const failures = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, 'Failed to clean content verification fixtures');
}
