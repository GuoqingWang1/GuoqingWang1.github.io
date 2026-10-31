import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { profile } from '../src/data/profile.ts';
import { copy } from '../src/lib/i18n.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = new URL(process.env.SITE_URL || 'https://guoqingwang1.github.io');
const languages = ['en', 'zh-CN'];
const research = {
  en: ['Large language models & agents', 'Agentic reinforcement learning · Deep research'],
  'zh-CN': ['大语言模型与智能体', '智能体强化学习 · 深度研究'],
};
const alt = lang => lang === 'zh-CN'
  ? `${profile.name}，${copy[lang].affiliation}；大语言模型与智能体、智能体强化学习和深度研究。`
  : `${profile.name} — ${copy[lang].affiliation}. ${research[lang].join('. ')}.`;
const escape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function imageInfo(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { extension: 'png', type: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) throw new Error('Invalid JPEG marker.');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = bytes.readUInt16BE(offset);
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        return { extension: 'jpg', type: 'image/jpeg', width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
      }
      if (length < 2) throw new Error('Invalid JPEG segment.');
      offset += length;
    }
  }
  throw new Error('Use a PNG or JPEG export.');
}

const [command, ...arguments_] = process.argv.slice(2);
if (command === 'prepare') {
  const output = path.resolve(arguments_[0] || path.join(root, '.astro/share-card-preview'));
  await mkdir(output, { recursive: true });
  const font = (await readFile(path.join(root, 'node_modules/@fontsource/spectral/files/spectral-latin-400-normal.woff2'))).toString('base64');
  for (const lang of languages) {
    const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(profile.name)} — share preview</title>
<style>
@font-face{font-family:Spectral;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400;font-style:normal;font-display:block}
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#fff;color:#101010;-webkit-font-smoothing:antialiased}
.card{position:relative;width:1200px;height:630px;padding:80px;font-family:Spectral,"Songti SC",Georgia,serif}
h1{margin:0;font-size:88px;font-weight:400;line-height:1.12;letter-spacing:-.04em}
.affiliation{margin:14px 0 0;font:24px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif;color:#656565}
.research{margin:58px 0 0;font-size:32px;line-height:1.5;font-weight:400;letter-spacing:-.012em}.research span{display:block}
footer{position:absolute;left:80px;right:80px;bottom:62px;border-top:1px solid #dedede;padding-top:23px;text-align:right;font:20px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#656565}
</style></head><body><main class="card" aria-label="${escape(alt(lang))}"><h1 lang="en">${escape(profile.name)}</h1><p class="affiliation">${escape(copy[lang].affiliation)}</p><p class="research">${research[lang].map(line => `<span>${escape(line)}</span>`).join('')}</p><footer>${escape(origin.hostname)}</footer></main></body></html>`;
    await writeFile(path.join(output, `${lang === 'en' ? 'en' : 'zh'}.html`), html);
  }
  console.log(`Prepared two self-contained 1200×630 cards in ${output}`);
} else if (command === 'import') {
  if (arguments_.length !== 2) throw new Error('Usage: npm run cards -- import <English image> <Chinese image>');
  const manifest = {};
  await mkdir(path.join(root, 'public/social'), { recursive: true });
  for (const [index, lang] of languages.entries()) {
    const source = path.resolve(arguments_[index]);
    const bytes = await readFile(source);
    const info = imageInfo(bytes);
    if (info.width !== 1200 || info.height !== 630 || bytes.length >= 5_000_000) throw new Error(`${lang}: export must be 1200×630 and under 5 MB.`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const imagePath = `/social/guoqing-wang-${lang === 'en' ? 'en' : 'zh'}-${sha256.slice(0, 12)}.${info.extension}`;
    await copyFile(source, path.join(root, 'public', imagePath.slice(1)));
    manifest[lang] = { path: imagePath, width: info.width, height: info.height, type: info.type, alt: alt(lang), sha256 };
  }
  await writeFile(path.join(root, 'src/data/share-images.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
} else {
  throw new Error('Usage: npm run cards -- prepare [preview directory] | import <English image> <Chinese image>');
}
