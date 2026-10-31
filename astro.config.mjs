import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL || 'https://guoqingwang1.github.io';
const url = new URL(site);
if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
  throw new Error('SITE_URL must be an HTTPS origin, without a path, query, or fragment.');
}

export default defineConfig({
  site: url.origin,
  output: 'static',
  trailingSlash: 'always',
  i18n: { locales: ['zh-CN', 'en'], defaultLocale: 'zh-CN', routing: { prefixDefaultLocale: false } },
  devToolbar: { enabled: false },
  markdown: { shikiConfig: { theme: 'github-light', wrap: true } },
});
