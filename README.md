# Guoqing Wang — personal website

A static academic homepage and Markdown blog, built with Astro. Intended repository: `GuoqingWang1/GuoqingWang1.github.io`.

## Develop

Requires Node.js 24 (24.14.0 or later).

```sh
npm ci
npm run dev
```

## Build and verify

```sh
npm run test:content
npm run build
npm run verify
npm run preview
```

Astro may keep the preview server running in the background. Stop this project's preview with `npx astro preview stop` when finished.

The `dist/` directory is the complete website. It contains no backend service or runtime API dependency. GitHub Pages serves this directory; the repository root must be this website project, not a parent workspace.

## Edit

- Bilingual UI copy and path helpers: `src/lib/i18n.ts`
- Profile and public links: `src/data/profile.ts`
- Publication records: `src/data/publications.json`
- Verified public updates: `src/data/news.json`
- Layout and typography: `src/layouts/`, `src/styles/global.css`
- GW monogram and favicon: `public/logo.svg`
- Finalized articles: `src/content/blog/*.md`
- Article format: `templates/post.md`

English is the default. The header switches between `/`, `/publications/`, `/blog/` and their `/zh/` equivalents. Navigation, introduction, News and Blog UI are localized; all publication records remain in English. English RSS is `/rss.xml`, and Chinese RSS is `/zh/rss.xml`.

The former `/en/`, `/en/publications/`, and `/en/blog/` addresses are static redirects to their current English URLs, preserving fragments with JavaScript and providing an HTML-refresh fallback. `/en/rss.xml` remains a compatible English feed. Legacy aliases are excluded from the sitemap.

The site uses the selected E design: an editorial layout with a white, black, and gray palette. A compact name/institution header sits above the introduction. News and six selected publications form two desktop columns and stack on mobile. News initially shows five entries on desktop or three on mobile, with a localized expansion control. Publications is one continuous list of thirteen records with the curated priority order followed by the remaining works in reverse publication-date order.

Spectral is self-hosted for the identity, headings, introduction and publication titles; interface text, News and metadata use the system sans-serif stack. The chosen design uses a plain white background and subtle link transitions. Header contact icons and the language switch are available at every screen size. Article bodies retain a readable sans-serif column with headings, code, tables and keyboard navigation. The implementation uses normal Astro pages.

Each article has Chinese and English versions joined by the same `translationKey`. For example, `example.md` (`lang: zh-CN`) and `example-en.md` (`lang: en`) both use `translationKey: example`; their URLs are `/zh/blog/example/` and `/blog/example/`. Both Blog views show the same article catalog in the same order, using localized titles, descriptions and bodies. RSS feeds are localized views of that catalog. Article language links open the corresponding version of the same article, with H2 sections mapped in order so an active section anchor can survive the switch. Keep translated H2 sections in matching order. Never link to a missing, draft or future translation; an unpaired article has no translation control, and production verification requires the complete bilingual catalog.

Publish and review both versions together, preserving article dates, category, topic, order and review status. Duplicate `translationKey` plus `lang` combinations fail the build. Article pages declare reciprocal language alternatives and keep their own canonical URLs. Articles retain a wide-screen side directory, a compact-screen collapsible directory, code highlighting and reading time. RSS, sitemap, canonical URLs and sharing metadata are generated at build time.

Article scripts progressively add a localized copy button to code blocks, preserving code text and indentation. Copy uses the browser Clipboard API after a click; failures show a manual-copy message. The current H2 is highlighted as readers scroll, and the article language link follows that section's translation without changing browser history. The same language control stays reachable after the main header scrolls out of view. Without JavaScript, code, table-of-contents links and the static same-article language link remain usable.

An explicitly authorized public review draft uses `draft: false` with `review: true`; the latter displays a small Draft/初稿 label and does not override draft or future-date filtering. Dates are displayed in Asia/Shanghai, while metadata and RSS retain the publication instant. Use a timezone-qualified `pubDate` timestamp when publishing immediately near a date boundary.

Only articles with `draft: false` and a publication date no later than build time appear on the site. The default is draft. **This flag does not make a file private in a public GitHub repository.** Keep private notes and unfinished research outside this repository; copy only publication-approved material here. The template is an example of structure, not an article.

## Sharing cards

English and Chinese pages use matching 1200×630 JPEG/PNG cards. The committed raster files are in `public/social/`; `src/data/share-images.json` supplies their paths, dimensions, MIME types, alternative text and SHA256 checksums. The layout emits Open Graph image metadata and a large-image X card.

To revise a card, run `npm run cards -- prepare` to generate self-contained HTML in `.astro/share-card-preview/`. Render each page at exactly 1200×630 with its fonts loaded and export an unscaled JPEG or PNG. Then run `npm run cards -- import <English image> <Chinese image>` and build/verify the site. The source design is in `scripts/share-cards.mjs`, using the existing Spectral font and E palette. The public asset filenames include content hashes; older assets are not removed automatically so cached links remain valid. Third-party preview caches may refresh independently of a deployment.

## Hosting

The default public URL is `https://guoqingwang1.github.io`. Set `SITE_URL` to a registered and configured custom domain when ready. No custom domain is bound by this project. See [deployment instructions](DEPLOYMENT.md).

CI validates every push and pull request. Public deployment is a separate manual workflow, so preparing a change does not publish the website automatically.

## Design sources

Academic information hierarchy was informed by the public HTML/CSS of [Ru Peng’s site](https://pengr.github.io/) and [Sunhao Dai’s site](https://kid-22.github.io/), including the latter’s public publication-rendering scripts. Typography, whitespace, navigation and Blog interaction details were informed by [Nathan Chen’s site](https://nathanchen.me/). [Yuqi Zhou’s site](https://yuqi-zhou.github.io/) additionally informed the short News list between the introduction and selected publications. The implementation and personal content are maintained here independently; reference snapshots are not included. Spectral is distributed under the SIL Open Font License, and the GitHub/Google Scholar glyphs come from Simple Icons (CC0). License texts are included in `public/licenses/`.
