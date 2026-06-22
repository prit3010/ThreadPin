import type { Adapter, Bookmark } from './types';
import {
  findBestScrollContainer,
  findNearestScrollContainer,
} from './scroll';

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
    const paragraphEl = findExactParagraph(messageEl, bookmark, adapter);

    if (paragraphEl) {
      (paragraphEl as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' });
      flashHighlight(paragraphEl as HTMLElement);
      return true;
    }

    if (hasSavedVirtualPosition(bookmark)) {
      const restored = await restoreSavedVirtualPosition(bookmark, adapter);
      if (restored !== null) return restored;
    }

    const textAnchor = getTextAnchor(bookmark);
    if (textAnchor) {
      const foundInMessage = findTextInRoot(
        textAnchor,
        messageEl,
        adapter.getTextBlockSelector?.() ?? 'p, pre, li, code',
        adapter.getMessageContainerSelector()
      );
      if (foundInMessage) {
        foundInMessage.scrollIntoView({ behavior: 'instant', block: 'center' });
        flashHighlight(foundInMessage);
        return true;
      }
    }

    if (restoreRelativeMessageOffset(bookmark, messageEl)) {
      flashHighlight(messageEl as HTMLElement);
      return true;
    }

    (messageEl as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' });
    flashHighlight(messageEl as HTMLElement);
    return true;
  }

  if (hasSavedVirtualPosition(bookmark)) {
    const restored = await restoreSavedVirtualPosition(bookmark, adapter);
    if (restored !== null) return restored;
  }

  // Strategy 2: search for anchor text in page message containers.
  const textAnchor = getTextAnchor(bookmark);
  if (textAnchor) {
    const found = findTextInPage(
      textAnchor,
      adapter.getTextBlockSelector?.() ?? 'p, pre, li, code',
      adapter.getMessageContainerSelector()
    );
    if (found) {
      found.scrollIntoView({ behavior: 'instant', block: 'center' });
      flashHighlight(found);
      return true;
    }
  }

  if (restoreSavedScrollContainerTop(bookmark, adapter)) {
    await waitForScrollSettle();
    return false;
  }

  // Strategy 3: raw scroll-position fallback.
  const scroller = adapter.getScrollContainer?.();
  if (scroller) {
    scroller.scrollTo({ top: bookmark.scrollY, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: bookmark.scrollY, behavior: 'smooth' });
  }
  return false;
}

async function restoreSavedVirtualPosition(
  bookmark: Bookmark,
  adapter: Adapter
): Promise<boolean | null> {
  const scrollContainer = restoreSavedScrollContainerTop(bookmark, adapter);
  if (!scrollContainer) return null;

  const restoredTarget = await waitForRestoredTarget(bookmark, adapter);
  if (restoredTarget) {
    restoredTarget.scrollIntoView({ behavior: 'instant', block: 'center' });
    flashHighlight(restoredTarget);
    return true;
  }

  const scannedTarget = await scanNearbyRestoredPositions(
    bookmark,
    adapter,
    scrollContainer
  );
  if (scannedTarget) {
    scannedTarget.scrollIntoView({ behavior: 'instant', block: 'center' });
    flashHighlight(scannedTarget);
    return true;
  }

  if (!restoreSavedAbsoluteTargetOffset(bookmark, scrollContainer)) {
    return false;
  }

  await waitForScrollSettle();
  const targetAfterOffset = findRestoredTarget(bookmark, adapter);
  if (targetAfterOffset) {
    flashHighlight(targetAfterOffset);
  }
  return true;
}

function hasSavedVirtualPosition(bookmark: Bookmark): boolean {
  return Number.isFinite(bookmark.scrollContainerTop);
}

async function waitForRestoredTarget(
  bookmark: Bookmark,
  adapter: Adapter,
  timeoutMs = 1500
): Promise<HTMLElement | null> {
  const startedAt = Date.now();
  do {
    await waitForScrollSettle();
    const target = findRestoredTarget(bookmark, adapter);
    if (target) return target;
  } while (Date.now() - startedAt < timeoutMs);

  return null;
}

async function scanNearbyRestoredPositions(
  bookmark: Bookmark,
  adapter: Adapter,
  scrollContainer: HTMLElement
): Promise<HTMLElement | null> {
  if (!getTextAnchor(bookmark)) return null;

  const baseTop =
    getSavedAbsoluteTargetTop(bookmark) ??
    (Number.isFinite(bookmark.scrollContainerTop)
      ? bookmark.scrollContainerTop as number
      : scrollContainer.scrollTop);
  const candidates = buildNearbyScrollCandidates(baseTop);

  for (const top of candidates) {
    setElementScrollTop(scrollContainer, top);
    await waitForScrollSettle();
    const target = findRestoredTarget(bookmark, adapter);
    if (target) return target;
  }

  return null;
}

function buildNearbyScrollCandidates(baseTop: number): number[] {
  const candidates: number[] = [baseTop];
  for (const radius of [
    600,
    1200,
    1800,
    2400,
    3600,
    5400,
    7200,
    9600,
    12000,
    16000,
    22000,
  ]) {
    candidates.push(baseTop - radius, baseTop + radius);
  }
  return Array.from(new Set(candidates.filter(Number.isFinite)));
}

function findRestoredTarget(
  bookmark: Bookmark,
  adapter: Adapter
): HTMLElement | null {
  const remountedMessage = findElementByAttribute(
    document,
    '[data-message-id]',
    'data-message-id',
    bookmark.messageId
  );
  const exactParagraph = remountedMessage
    ? findExactParagraph(remountedMessage, bookmark, adapter)
    : null;

  if (exactParagraph) return exactParagraph as HTMLElement;

  const textAnchor = getTextAnchor(bookmark);
  if (!textAnchor) return null;
  return findTextInPage(
    textAnchor,
    adapter.getTextBlockSelector?.() ?? 'p, pre, li, code',
    adapter.getMessageContainerSelector()
  );
}

function findExactParagraph(
  messageEl: Element,
  bookmark: Bookmark,
  adapter: Adapter
): Element | null {
  if (bookmark.dataStart === null) return null;
  return findElementByAttribute(
    messageEl,
    adapter.getParagraphSelector(),
    'data-start',
    String(bookmark.dataStart)
  );
}

function restoreSavedScrollContainerTop(
  bookmark: Bookmark,
  adapter: Adapter
): HTMLElement | null {
  if (!Number.isFinite(bookmark.scrollContainerTop)) return null;

  const adapterScroller = adapter.getScrollContainer?.();
  const scrollContainer =
    adapterScroller instanceof HTMLElement
      ? adapterScroller
      : findBestScrollContainer(adapter.getMessageContainerSelector());
  if (!scrollContainer) return null;

  setElementScrollTop(scrollContainer, bookmark.scrollContainerTop as number);
  return scrollContainer;
}

function restoreSavedAbsoluteTargetOffset(
  bookmark: Bookmark,
  scrollContainer: HTMLElement
): boolean {
  const targetTop = getSavedAbsoluteTargetTop(bookmark);
  if (targetTop === null) return false;

  setElementScrollTop(scrollContainer, targetTop);
  return true;
}

function getSavedAbsoluteTargetTop(bookmark: Bookmark): number | null {
  if (!Number.isFinite(bookmark.scrollContainerTop)) return null;
  if (!Number.isFinite(bookmark.messageOffsetY)) return null;

  return (
    (bookmark.scrollContainerTop as number) +
    (bookmark.messageOffsetY as number) -
    getViewportY(bookmark)
  );
}

function restoreRelativeMessageOffset(
  bookmark: Bookmark,
  messageEl: Element
): boolean {
  if (!Number.isFinite(bookmark.messageOffsetY)) return false;

  const viewportY = getViewportY(bookmark);
  const messageRect = messageEl.getBoundingClientRect();
  const scrollContainer = findNearestScrollContainer(messageEl);
  const delta =
    messageRect.top + (bookmark.messageOffsetY as number) - viewportY;

  if (scrollContainer) {
    setElementScrollTop(scrollContainer, scrollContainer.scrollTop + delta);
    return true;
  }

  window.scrollTo({
    top: window.scrollY + delta,
    behavior: 'instant',
  });
  return true;
}

function getViewportY(bookmark: Bookmark): number {
  if (
    Number.isFinite(bookmark.viewportFraction) &&
    window.innerHeight > 0
  ) {
    return (bookmark.viewportFraction as number) * window.innerHeight;
  }
  return window.innerHeight / 2;
}

function getTextAnchor(bookmark: Bookmark): string | null {
  const selectedText = normalizeSearchText(bookmark.selectedText);
  if (selectedText) return selectedText;

  const preview = normalizeSearchText(bookmark.preview);
  return preview && preview.length >= 8 ? preview : null;
}

function normalizeSearchText(text: string | null | undefined): string | null {
  const normalized = text?.trim();
  return normalized ? normalized : null;
}

function setElementScrollTop(element: HTMLElement, top: number): void {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  const nextTop = maxScrollTop > 0
    ? Math.min(maxScrollTop, Math.max(0, top))
    : top;

  element.scrollTo?.({ top: nextTop, behavior: 'instant' });
  element.scrollTop = nextTop;
  element.dispatchEvent(new Event('scroll', { bubbles: true }));
}

function waitForScrollSettle(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 50);
      });
    });
  });
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
  textBlockSelector: string,
  containerSelector: string
): HTMLElement | null {
  return findTextInRoot(text, document, textBlockSelector, containerSelector);
}

function findTextInRoot(
  text: string,
  root: ParentNode,
  textBlockSelector: string,
  containerSelector: string
): HTMLElement | null {
  const needle = text.slice(0, 50).toLowerCase();
  if (!needle) return null;

  const searchRoots = getTextSearchRoots(root, containerSelector);

  // Search within likely text blocks first for a more precise landing spot.
  for (const searchRoot of searchRoots) {
    const textBlocks = searchRoot.querySelectorAll(textBlockSelector);
    for (const block of textBlocks) {
      if (block.textContent?.toLowerCase().includes(needle)) {
        return block as HTMLElement;
      }
    }
  }

  // Search within known message containers as a broader fallback.
  for (const searchRoot of searchRoots) {
    if (searchRoot.textContent?.toLowerCase().includes(needle)) {
      return searchRoot as HTMLElement;
    }
  }

  return null;
}

function getTextSearchRoots(
  root: ParentNode,
  containerSelector: string
): Element[] {
  if (root instanceof Element) {
    if (root.matches(containerSelector)) return [root];
    const roots = Array.from(root.querySelectorAll(containerSelector));
    return roots.length > 0 ? roots : [root];
  }
  const roots = Array.from(root.querySelectorAll(containerSelector));
  return roots.length > 0
    ? roots
    : [document.body ?? document.documentElement];
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
