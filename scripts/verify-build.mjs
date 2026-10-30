import { readFile, readdir, access, lstat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('dist');
const origin = new URL(process.env.SITE_URL || 'https://guoqingwang1.github.io').origin;
async function files(dir) {
  const list = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected symlink in output: ${name}`);
    list.push(...(entry.isDirectory() ? await files(name) : [name]));
  }
  return list;
}
for (const required of ['index.html', 'blog/index.html', '404.html', 'logo.svg', 'rss.xml', 'sitemap.xml', 'robots.txt']) await access(path.join(root, required));
const output = await files(root);
let pages = 0;
for (const filename of output) {
  const relative = path.relative(root, filename);
  assert(!/(^|\/)(editorial|work|node_modules|src|\.git)(\/|$)/.test(relative), `Source directory leaked: ${relative}`);
  if (!/\.(html|js|css|xml|txt|svg)$/.test(filename)) continue;
  const text = await readFile(filename, 'utf8');
  assert(!/(\/Users\/|file:\/\/|localhost:\d|127\.0\.0\.1|FIRST_NEW_UPDATES|native-attempt|__VERIFICATION_)/.test(text), `Unexpected local/private/test marker in ${relative}`);
  if (!filename.endsWith('.html')) continue;
  pages++;
  assert(/<title>[^<]+<\/title>/.test(text), `Missing page title: ${relative}`);
  assert(text.includes('rel="canonical"'), `Missing canonical: ${relative}`);
  const canonical = text.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/);
  assert(canonical && new URL(canonical[1]).origin === origin, `Wrong canonical: ${relative}`);
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
console.log(`Verified ${pages} HTML pages and ${output.length} output files: links, canonical URLs, and public-output boundaries.`);
