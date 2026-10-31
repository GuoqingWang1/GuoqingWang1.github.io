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

- Profile and public links: `src/data/profile.ts`
- Publication records: `src/data/publications.json`
- Layout and typography: `src/layouts/`, `src/styles/global.css`
- GW monogram and favicon: `public/logo.svg`
- Finalized articles: `src/content/blog/*.md`
- Article format: `templates/post.md`

The site has separate About, Publications, and Blog pages. The header exposes GitHub and Google Scholar as labeled icon links. Spectral is self-hosted. The homepage has a small original 2D particle background with pause and reduced-motion support; there is no 3D sculpture.

Articles have their own `/blog/<slug>/` URL, heading navigation, code highlighting, reading time, and category filters. RSS, sitemap, canonical URLs, and sharing metadata are generated at build time. The blog stays empty until a real article is finalized.

Only articles with `draft: false` and a publication date no later than build time appear on the site. The default is draft. **This flag does not make a file private in a public GitHub repository.** Keep private notes and unfinished research outside this repository; copy only publication-approved material here. The template is an example of structure, not an article.

## Hosting

The default public URL is `https://guoqingwang1.github.io`. Set `SITE_URL` to a registered and configured custom domain when ready. No custom domain is bound by this project. See [deployment instructions](DEPLOYMENT.md).

CI validates every push and pull request. Public deployment is a separate manual workflow, so preparing a change does not publish the website automatically.

## Design sources

Layout and interaction details were informed by inspecting the public HTML/CSS of [Nathan Chen’s site](https://nathanchen.me/). The implementation and personal content are maintained here independently; reference snapshots are not included. Spectral is distributed under the SIL Open Font License, and the GitHub/Google Scholar glyphs come from Simple Icons (CC0). License texts are included in `public/licenses/`.
