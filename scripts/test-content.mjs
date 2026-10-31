import { mkdir, mkdtemp, readFile, readdir, writeFile, unlink, rm, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const content = path.resolve('src/content/blog');
const work = path.resolve(process.env.VERIFY_WORK_DIR || '.verify-work');
const origin = new URL(process.env.SITE_URL || 'https://guoqingwang1.github.io').origin;
let temporary;
const languages = [
  { lang: 'zh-CN', key: 'zh', home: '/', otherHome: '/en/' },
  { lang: 'en', key: 'en', home: '/en/', otherHome: '/' },
];
const fixtures = languages.flatMap(language => [
  { ...language, name: `verification-published-${language.key}`, status: `draft: false\nslug: verification-public-${language.key}`, date: '2000-01-01', marker: `__VERIFICATION_PUBLIC_${language.key.toUpperCase()}__`, published: true },
  ...[
    ['draft', 'draft: true', '2000-01-01'],
    ['default', '', '2000-01-01'],
    ['future', 'draft: false', '2999-01-01'],
  ].map(([kind, status, date]) => ({ ...language, name: `verification-${kind}-${language.key}`, status, date, marker: `__VERIFICATION_PRIVATE_${kind.toUpperCase()}_${language.key.toUpperCase()}__`, published: false })),
]);
const created = [];
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
  for (const fixture of fixtures.filter(f => f.published)) {
    const { lang, key, home, otherHome, marker } = fixture;
    const slug = `verification-public-${key}`;
    const route = `${home}blog/${slug}/`;
    const article = await readFile(path.join(output, route.slice(1), 'index.html'), 'utf8');
    assert(article.includes(marker), `Published ${lang} fixture missing`);
    assert(new RegExp(`<html\\b[^>]*lang="${lang}"`).test(article), `Wrong article language: ${route}`);
    assert(article.includes('href="#first-section"'), `Article TOC missing: ${route}`);
    assert(article.includes('<pre'), `Code block was not rendered: ${route}`);
    const canonical = article.match(/<link\b(?=[^>]*rel="canonical")(?=[^>]*href="([^"]+)")[^>]*>/);
    assert.equal(canonical?.[1], `${origin}${route}`, `Wrong article canonical: ${route}`);
    assert(!/<link\b[^>]*hreflang=/.test(article), `Article advertises a nonexistent translation: ${route}`);
    assert(new RegExp(`<a\\b(?=[^>]*class="[^"]*\\barticle-back\\b)(?=[^>]*href="${home}blog/")[^>]*>`).test(article), `Article back link changes language: ${route}`);
    await assert.rejects(access(path.join(output, `${otherHome}blog/${slug}/`.slice(1), 'index.html')), { code: 'ENOENT' }, `Unprovided translated article was generated: ${slug}`);
    for (const name of ['blog/index.html', 'rss.xml']) {
      const own = await readFile(path.join(output, home.slice(1), name), 'utf8');
      const other = await readFile(path.join(output, otherHome.slice(1), name), 'utf8');
      assert(own.includes(marker), `Published ${lang} fixture missing from ${home}${name}`);
      assert(own.includes(route), `Published route missing from ${home}${name}`);
      assert(!other.includes(marker) && !other.includes(route), `${lang} article leaked into the other-language ${name}`);
    }
    assert(sitemap.includes(`${origin}${route}`), `Sitemap omits published ${lang} article`);
  }
  for (const fixture of fixtures.filter(f => !f.published)) {
    for (const home of ['/', '/en/']) {
      await assert.rejects(access(path.join(output, `${home}blog/${fixture.name}/`.slice(1), 'index.html')), { code: 'ENOENT' }, `Unpublished route generated: ${fixture.name}`);
    }
  }
  console.log('Bilingual content boundaries passed: independent Chinese/English articles render only in their own routes, lists and RSS; sitemap includes both; drafts, default-drafts, future posts and invented translations are excluded.');
} finally {
  const cleanup = await Promise.allSettled([
    ...created.map(target => unlink(target)),
    ...(temporary ? [rm(temporary, { recursive: true, force: true })] : []),
  ]);
  const failures = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, 'Failed to clean content verification fixtures');
}
