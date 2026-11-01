type CopyLabels = { copy: string; copied: string; failed: string; copyLabel: string };

export function setupCodeCopy(root: HTMLElement, labels: CopyLabels) {
  root.querySelectorAll<HTMLPreElement>('pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (!code || pre.parentElement?.classList.contains('code-block')) return;

    const block = document.createElement('div');
    block.className = 'code-block';
    pre.before(block);
    block.append(pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy';
    button.textContent = labels.copy;
    button.setAttribute('aria-label', labels.copyLabel);
    const status = document.createElement('span');
    status.className = 'code-copy-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    block.append(button, status);

    let pending = false;
    let resetTimer: ReturnType<typeof setTimeout>;
    button.addEventListener('click', async () => {
      if (pending) return;
      pending = true;
      clearTimeout(resetTimer);
      status.textContent = '';
      button.setAttribute('aria-busy', 'true');
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code.textContent ?? '');
        button.textContent = labels.copied;
        status.textContent = labels.copied;
        block.dataset.copyState = 'success';
      } catch {
        button.textContent = labels.failed;
        status.textContent = labels.failed;
        block.dataset.copyState = 'error';
      } finally {
        pending = false;
        button.removeAttribute('aria-busy');
        resetTimer = setTimeout(() => {
          button.textContent = labels.copy;
          status.textContent = '';
          delete block.dataset.copyState;
        }, 2500);
      }
    });
  });
}
