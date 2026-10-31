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

About, Publications, the global navigation, and the default Blog are in English. Only Blog offers a language choice: `/blog/` for English and `/zh/blog/` for Chinese. The header stays English in both Blog views; About and Publications always point to the English pages. Language alternates are advertised only for the two real Blog indexes. English RSS is `/rss.xml`, and Chinese RSS is `/zh/rss.xml`.

The former `/en/`, `/en/publications/`, and `/en/blog/` addresses are static redirects to their current English URLs, preserving fragments with JavaScript and providing an HTML-refresh fallback. `/en/rss.xml` remains a compatible English feed. Legacy aliases are excluded from the sitemap.

The site uses the selected E design: an editorial layout with a white, black, and gray palette. On desktop, the introduction uses two columns, with News beside three selected papers; on mobile, sections stack in reading order. Publications keeps six conference papers and two reports/preprints in separate groups, each sorted newest first. Its category labels form a quiet side column on desktop. The real `/#news` link targets the News section.

Spectral is self-hosted for the identity, headings, introduction and publication titles; interface text, News and metadata use the system sans-serif stack. The name is slightly smaller than the reviewed candidate. The chosen design uses a plain white background and subtle link transitions. Header links are visible at every screen size, and Blog language choices sit beside the Blog heading. Article bodies retain a readable sans-serif column with headings, code, tables and keyboard navigation. The implementation uses normal Astro pages, not the local comparison viewer or its hash router.

English articles have a `/blog/<slug>/` URL; Chinese articles use `/zh/blog/<slug>/`, selected by the article’s `lang` field. Each language’s list and RSS feed includes only articles written in that language. An article without a translation links to the other language’s blog list, rather than pretending its body has been translated. Articles provide heading navigation, code highlighting, reading time, and category filters. RSS, sitemap, canonical URLs, and sharing metadata are generated at build time. The blog stays empty until a real article is finalized.

Only articles with `draft: false` and a publication date no later than build time appear on the site. The default is draft. **This flag does not make a file private in a public GitHub repository.** Keep private notes and unfinished research outside this repository; copy only publication-approved material here. The template is an example of structure, not an article.

## Hosting

The default public URL is `https://guoqingwang1.github.io`. Set `SITE_URL` to a registered and configured custom domain when ready. No custom domain is bound by this project. See [deployment instructions](DEPLOYMENT.md).

CI validates every push and pull request. Public deployment is a separate manual workflow, so preparing a change does not publish the website automatically.

## Design sources

Academic information hierarchy was informed by the public HTML/CSS of [Ru Peng’s site](https://pengr.github.io/) and [Sunhao Dai’s site](https://kid-22.github.io/), including the latter’s public publication-rendering scripts. Typography, whitespace, navigation and Blog interaction details were informed by [Nathan Chen’s site](https://nathanchen.me/). [Yuqi Zhou’s site](https://yuqi-zhou.github.io/) additionally informed the short News list between the introduction and selected publications. The implementation and personal content are maintained here independently; reference snapshots are not included. Spectral is distributed under the SIL Open Font License, and the GitHub/Google Scholar glyphs come from Simple Icons (CC0). License texts are included in `public/licenses/`.
