import type { Adapter, AnchorData, Bookmark } from './types';
import { findNearestScrollContainer } from './scroll';

export function captureAnchor(
  adapter: Adapter,
  viewportY = window.innerHeight / 2
): AnchorData {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() || null;

  const scroller = adapter.getScrollContainer?.();
  const scrollY = scroller ? (scroller as HTMLElement).scrollTop : window.scrollY;
  const textBlockSelector = adapter.getTextBlockSelector?.() ?? 'p, pre, li, code';

  // Find the message container closest to the viewport center.
  // Only consider containers that are at least partially visible in the
  // viewport (rect.bottom > 0 && rect.top < innerHeight) so a tall header
  // above the messages can't steal the "nearest" slot when at the top.
  const containers = Array.from(
    document.querySelectorAll(adapter.getMessageContainerSelector())
  );

  const visibleContainers = containers.filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  });

  const pool = visibleContainers.length > 0 ? visibleContainers : containers;

  // Rank by the capture line's distance to each container's edges: 0 when the
  // line falls inside [top, bottom] (the message the line is actually on),
  // otherwise the gap to the nearest edge. Using edge distance instead of the
  // center avoids a bias against tall messages — a long answer the line sits
  // inside would otherwise lose to a small neighbour whose center is closer.
  function distanceFromCaptureLine(el: Element): number {
    const rect = el.getBoundingClientRect();
    if (viewportY < rect.top) return rect.top - viewportY;
    if (viewportY > rect.bottom) return viewportY - rect.bottom;
    return 0;
  }

  const nearestContainer = pool.reduce<Element | null>(
    (nearest, el) => {
      if (!nearest) return el;
      return distanceFromCaptureLine(el) < distanceFromCaptureLine(nearest)
        ? el
        : nearest;
    },
    null
  );

  if (!nearestContainer) {
    return {
      messageId: '',
      dataStart: 0,
      scrollY,
      scrollContainerTop: null,
      messageOffsetY: null,
      viewportFraction: getViewportFraction(viewportY),
      selectedText,
      preview: selectedText?.slice(0, 120) ?? '',
    };
  }

  const messageId = nearestContainer.getAttribute('data-message-id') ?? '';
  const scrollContainer =
    scroller instanceof HTMLElement
      ? scroller
      : findNearestScrollContainer(nearestContainer);
  const messageRect = nearestContainer.getBoundingClientRect();
  const messageOffsetY = clamp(
    viewportY - messageRect.top,
    0,
    Math.max(0, messageRect.height)
  );

  // Find the visible paragraph closest to the viewport center within that
  // message. If the current spot is a code block or another unanchored region,
  // leave dataStart null instead of snapping to an off-screen paragraph.
  const paragraphs = Array.from(
    nearestContainer.querySelectorAll(adapter.getParagraphSelector())
  );
  const visibleParagraphs = paragraphs.filter(isVisibleInViewport);
  const nearestP = closestToViewportY(visibleParagraphs, viewportY);

  const nearestTextBlock = closestToViewportY(
    Array.from(nearestContainer.querySelectorAll(textBlockSelector))
      .filter(isVisibleInViewport),
    viewportY
  );

  // null means no stable paragraph anchor was found (e.g. cursor is inside a
  // code block or transiently unanchored text). New bookmarks still restore
  // via text matching, messageOffsetY, or saved scroll-container position.
  const anchorElement = getAnchorElementForTextBlock(
    nearestTextBlock,
    nearestContainer,
    adapter.getParagraphSelector()
  ) ?? (nearestTextBlock ? null : nearestP);
  const dataStartAttr = anchorElement?.getAttribute('data-start');
  const parsedDataStart = dataStartAttr !== null && dataStartAttr !== undefined
    ? parseInt(dataStartAttr, 10)
    : NaN;
  const dataStart = Number.isFinite(parsedDataStart) ? parsedDataStart : null;

  // Preview: prefer selection → readable block around nearest anchor → container text.
  // ChatGPT can put data-start on small inline fragments (for example a
  // bold phrase), but the drawer preview should describe the surrounding line.
  const rawPreview =
    selectedText ||
    getPreviewText(nearestTextBlock, nearestContainer) ||
    getPreviewText(nearestP, nearestContainer) ||
    nearestContainer.textContent?.trim().slice(0, 120) ||
    '';
  const preview = rawPreview.trim().slice(0, 120);

  return {
    messageId,
    dataStart,
    scrollY,
    scrollContainerTop: scrollContainer?.scrollTop ?? null,
    messageOffsetY,
    viewportFraction: getViewportFraction(viewportY),
    selectedText: selectedText ? selectedText.slice(0, 500) : null,
    preview,
  };
}

function getAnchorElementForTextBlock(
  textBlock: Element | null,
  container: Element,
  paragraphSelector: string
): Element | null {
  if (!textBlock) return null;
  const anchor = textBlock.closest(paragraphSelector);
  return anchor && container.contains(anchor) ? anchor : null;
}

function getViewportFraction(viewportY: number): number | null {
  if (!Number.isFinite(viewportY) || window.innerHeight <= 0) return null;
  return clamp(viewportY / window.innerHeight, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isVisibleInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

function closestToViewportCenter(
  elements: Element[],
  viewportY: number
): Element | null {
  return closestToViewportY(elements, viewportY);
}

function getPreviewText(
  element: Element | null,
  messageContainer: Element
): string | null {
  if (!element) return null;

  if (element.closest('pre')) {
    return element.textContent?.trim() || null;
  }

  const readableBlock = element.closest(
    'p, li, pre, blockquote, h1, h2, h3, h4, h5, h6'
  );
  if (readableBlock && messageContainer.contains(readableBlock)) {
    return readableBlock.textContent?.trim() || null;
  }

  return element.textContent?.trim() || null;
}

function closestToViewportY(
  elements: Element[],
  viewportY: number
): Element | null {
  return elements.reduce<Element | null>(
    (nearest, el) => {
      const rect = el.getBoundingClientRect();
      const clampedTop = Math.max(0, rect.top);
      const clampedBottom = Math.min(window.innerHeight, rect.bottom);
      const elCenter = (clampedTop + clampedBottom) / 2;
      const distance = Math.abs(elCenter - viewportY);

      if (!nearest) return el;

      const nearestRect = nearest.getBoundingClientRect();
      const nearestTop = Math.max(0, nearestRect.top);
      const nearestBottom = Math.min(window.innerHeight, nearestRect.bottom);
      const nearestCenter = (nearestTop + nearestBottom) / 2;
      const nearestDistance = Math.abs(nearestCenter - viewportY);

      return distance < nearestDistance ? el : nearest;
    },
    null
  );
}

export function createBookmark(
  conversationId: string,
  hostname: string,
  anchor: AnchorData
): Bookmark {
  return {
    id: crypto.randomUUID(),
    conversationId,
    hostname,
    ...anchor,
    createdAt: Date.now(),
  };
}
