export function setupArticleReading(article: HTMLElement) {
  const body = article.querySelector<HTMLElement>('.article-body');
  if (!body) return;
  const headings = Array.from(body.querySelectorAll<HTMLElement>('h2[id]'));
  const links = Array.from(article.querySelectorAll<HTMLAnchorElement>('.article-toc a'));
  const languageLink = document.querySelector<HTMLAnchorElement>('[data-article-translation]');
  const header = document.querySelector<HTMLElement>('.site-header');
  const anchorMap: Record<string, string> = JSON.parse(languageLink?.dataset.anchorMap || '{}');
  let currentId: string | undefined;
  let frame = 0;

  function update() {
    frame = 0;
    const readingLine = Math.min(140, window.innerHeight * 0.2);
    let active = '';
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top > readingLine) break;
      active = heading.id;
    }
    const atEnd = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    if (atEnd && headings.length) active = headings[headings.length - 1].id;

    if (active !== currentId) {
      currentId = active;
      article.dataset.currentSection = active;
      links.forEach(link => {
        if (link.getAttribute('href') === `#${active}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      if (languageLink) {
        languageLink.hash = Object.prototype.hasOwnProperty.call(anchorMap, active) ? anchorMap[active] : '';
      }
    }
    // Keep the same language control reachable while the original header is offscreen.
    if (languageLink && header) languageLink.classList.toggle('is-reading', header.getBoundingClientRect().bottom <= 0);
  }

  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', schedule);
  window.addEventListener('pageshow', schedule);
  window.addEventListener('load', schedule);
  article.querySelector('.article-toc-inline')?.addEventListener('toggle', schedule);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    observer.observe(article);
  }
  document.fonts?.ready.then(schedule);
  schedule();
}
