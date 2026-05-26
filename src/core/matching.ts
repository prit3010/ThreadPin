import type { Adapter, Bookmark } from './types';

export async function jumpToBookmark(
  bookmark: Bookmark,
  adapter: Adapter
): Promise<boolean> {
  // Strategy 1: find by data-message-id → data-start
  // Guard: skip if messageId is empty (bookmark captured on a non-message element)
  const messageEl = findElementByAttribute(
    document,
    '[data-message-id]',
    'data-message-id',
    bookmark.messageId
  );

  if (messageEl) {
    const paragraphEl = bookmark.dataStart !== null
      ? findElementByAttribute(
          messageEl,
          adapter.getParagraphSelector(),
          'data-start',
          String(bookmark.dataStart)
        )
      : null;

    if (paragraphEl) {
      (paragraphEl as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' });
      flashHighlight(paragraphEl as HTMLElement);
      return true;
    }

    if (bookmark.selectedText) {
      const foundInMessage = findTextInRoot(
        bookmark.selectedText,
        messageEl,
        adapter.getParagraphSelector()
      );
      if (foundInMessage) {
        foundInMessage.scrollIntoView({ behavior: 'instant', block: 'center' });
        flashHighlight(foundInMessage);
        return true;
      }
    }

    (messageEl as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' });
    flashHighlight(messageEl as HTMLElement);
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

function findElementByAttribute(
  root: ParentNode,
  selector: string,
  attribute: string,
  value: string
): Element | null {
  if (!value) return null;

  const elements = root.querySelectorAll(selector);
  for (const element of elements) {
    if (element.getAttribute(attribute) === value) {
      return element;
    }
  }
  return null;
}

function findTextInPage(
  text: string,
  containerSelector: string
): HTMLElement | null {
  return findTextInRoot(text, document, containerSelector);
}

function findTextInRoot(
  text: string,
  root: ParentNode,
  containerSelector: string
): HTMLElement | null {
  const needle = text.slice(0, 50).toLowerCase();
  if (!needle) return null;

  // Search within likely text blocks first for a more precise landing spot.
  const textBlocks = root.querySelectorAll('p, pre, li');
  for (const block of textBlocks) {
    if (block.textContent?.toLowerCase().includes(needle)) {
      return block as HTMLElement;
    }
  }

  // Search within known message containers as a broader fallback.
  const containers = root.querySelectorAll(containerSelector);
  for (const container of containers) {
    if (container.textContent?.toLowerCase().includes(needle)) {
      return container as HTMLElement;
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
