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
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      found.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  element.classList.add('threadpin-highlight');
  setTimeout(() => {
    element.classList.remove('threadpin-highlight');
  }, 2000);
}
