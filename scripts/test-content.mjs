import { mkdir, readFile, readdir, writeFile, unlink, rm, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const content = path.resolve('src/content/blog');
const work = path.resolve(process.env.VERIFY_WORK_DIR || '.verify-work');
const output = path.join(work, 'dist');
const fixtures = [
  ['verification-published', 'draft: false\nslug: verification-public-page', '2000-01-01', '__VERIFICATION_PUBLIC__'],
  ['verification-draft', 'draft: true', '2000-01-01', '__VERIFICATION_PRIVATE_DRAFT__'],
  ['verification-default', '', '2000-01-01', '__VERIFICATION_PRIVATE_DEFAULT__'],
  ['verification-future', 'draft: false', '2999-01-01', '__VERIFICATION_PRIVATE_FUTURE__'],
];
const created = [];
async function allText(dir) {
  let text = '';
  for (const entry of await readdir(dir, { withFileTypes:true })) {
    const name = path.join(dir,entry.name);
    if(entry.isDirectory()) text += await allText(name);
    else if(/\.(html|xml|txt|js)$/.test(name)) text += await readFile(name,'utf8');
  }
  return text;
}
try {
  await mkdir(work,{recursive:true});
  for(const [name,status,date,marker] of fixtures) {
    const target=path.join(content,`${name}.md`);
    const markdown=`---\ntitle: "${marker}"\ndescription: "Temporary content-pipeline verification fixture."\npubDate: ${date}\ncategory: technical\nlang: en\n${status}\n---\n\n## First section\n\nA synthetic fixture, never a published article.\n\n## Second section\n\n\`\`\`python\nprint("fixture")\n\`\`\`\n`;
    await writeFile(target,markdown,{flag:'wx'});created.push(target);
  }
  const run=spawnSync('npm',['run','build','--','--outDir',output],{encoding:'utf8',env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'}});
  assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
  const combined=await allText(output);
  for(const [, , ,marker] of fixtures.slice(1)) assert(!combined.includes(marker),`Unpublished content leaked: ${marker}`);
  const article=await readFile(path.join(output,'blog/verification-public-page/index.html'),'utf8');
  assert(article.includes('__VERIFICATION_PUBLIC__'),'Published fixture missing');
  assert(article.includes('href="#first-section"'),'Article TOC missing');
  assert(article.includes('<pre'),'Code block was not rendered');
  for(const name of ['blog/index.html','rss.xml','sitemap.xml']) {
    const text=await readFile(path.join(output,name),'utf8');
    assert(text.includes('/blog/verification-public-page/'),`Published route missing from ${name}`);
  }
  console.log('Content boundaries passed: approved article renders; draft, default-draft, and future content are excluded from pages, RSS and sitemap.');
} finally {
  for(const target of created) await unlink(target);
  await rm(output,{recursive:true,force:true});
}
