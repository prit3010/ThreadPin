import type { Adapter, Bookmark } from './types';

export async function jumpToBookmark(
  bookmark: Bookmark,
  adapter: Adapter
): Promise<boolean> {
  // Strategy 1: find by data-message-id → data-start
  const messageEl = document.querySelector(
    `[data-message-id="${bookmark.messageId}"]`
  );

  if (messageEl) {
    const paragraphEl = messageEl.querySelector(
      `[data-start="${bookmark.dataStart}"]`
    );
    const target = (paragraphEl ?? messageEl) as HTMLElement;
    target.scrollIntoView({ behavior: 'instant', block: 'center' });
    flashHighlight(target);
    return true;
  }

  // Strategy 2: search for selectedText in page containers
  if (bookmark.selectedText) {
    const found = findTextInPage(
      bookmark.selectedText,
      adapter.getMessageContainerSelector()
    );
    if (found) {
      found.scrollIntoView({ behavior: 'instant', block: 'center' });
      flashHighlight(found);
      return true;
    }
  }

  // Strategy 3: raw scrollY fallback
  window.scrollTo({ top: bookmark.scrollY, behavior: 'smooth' });
  return false;
}

function findTextInPage(
  text: string,
  containerSelector: string
): HTMLElement | null {
  const needle = text.slice(0, 50).toLowerCase();

  // Search within known message containers first
  const containers = document.querySelectorAll(containerSelector);
  for (const container of containers) {
    if (container.textContent?.toLowerCase().includes(needle)) {
      return container as HTMLElement;
    }
  }

  // Broad fallback: search all paragraphs on the page
  const paragraphs = document.querySelectorAll('p, pre, li');
  for (const p of paragraphs) {
    if (p.textContent?.toLowerCase().includes(needle)) {
      return p as HTMLElement;
    }
  }

  return null;
}

export function flashHighlight(element: HTMLElement): void {
  // Use a fixed-position overlay instead of a CSS class so we don't fight
  // ChatGPT's own element styles (which win on specificity battles).
  // scrollIntoView must use 'instant' so getBoundingClientRect() is stable
  // by the time we read it here.
  const rect = element.getBoundingClientRect();

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position: fixed',
    `top: ${rect.top - 3}px`,
    `left: ${rect.left - 3}px`,
    `width: ${rect.width + 6}px`,
    `height: ${Math.max(rect.height, 24) + 6}px`,
    'background: rgba(245, 158, 11, 0.25)',
    'border: 2px solid rgba(245, 158, 11, 0.75)',
    'border-radius: 6px',
    'pointer-events: none',
    'z-index: 2147483646',
    'opacity: 1',
    'transition: opacity 1.8s ease-out',
  ].join('; ');

  document.body.appendChild(overlay);

  // Trigger fade on the next two frames (one to paint, one to transition)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.opacity = '0';
    });
  });

  setTimeout(() => overlay.remove(), 2200);
}
