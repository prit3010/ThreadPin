import type { Adapter, AnchorData, Bookmark } from './types';

export function captureAnchor(adapter: Adapter): AnchorData {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() || null;
  const viewportCenter = window.innerHeight / 2;

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

  const nearestContainer = pool.reduce<Element | null>(
    (nearest, el) => {
      const rect = el.getBoundingClientRect();
      const elCenter = rect.top + rect.height / 2;
      const distance = Math.abs(elCenter - viewportCenter);

      if (!nearest) return el;

      const nearestRect = nearest.getBoundingClientRect();
      const nearestCenter = nearestRect.top + nearestRect.height / 2;
      const nearestDistance = Math.abs(nearestCenter - viewportCenter);

      return distance < nearestDistance ? el : nearest;
    },
    null
  );

  if (!nearestContainer) {
    return {
      messageId: '',
      dataStart: 0,
      scrollY: window.scrollY,
      selectedText,
      preview: selectedText?.slice(0, 120) ?? '',
    };
  }

  const messageId = nearestContainer.getAttribute('data-message-id') ?? '';

  // Find the paragraph closest to the viewport center within that message
  const paragraphs = Array.from(
    nearestContainer.querySelectorAll(adapter.getParagraphSelector())
  );

  const nearestP = paragraphs.reduce<Element | null>(
    (nearest, el) => {
      const rect = el.getBoundingClientRect();
      const elCenter = rect.top + rect.height / 2;
      const distance = Math.abs(elCenter - viewportCenter);

      if (!nearest) return el;

      const nearestRect = nearest.getBoundingClientRect();
      const nearestCenter = nearestRect.top + nearestRect.height / 2;
      const nearestDistance = Math.abs(nearestCenter - viewportCenter);

      return distance < nearestDistance ? el : nearest;
    },
    null
  );

  // null means no [data-start] paragraph was found (e.g. cursor is inside a
  // code block). jumpToBookmark will use scrollY for in-message positioning.
  const dataStartAttr = nearestP?.getAttribute('data-start');
  const dataStart = dataStartAttr !== null && dataStartAttr !== undefined
    ? parseInt(dataStartAttr, 10)
    : null;

  // Preview: prefer selection → nearest paragraph → container text (code block fallback)
  const rawPreview =
    selectedText ||
    nearestP?.textContent ||
    nearestContainer.textContent?.trim().slice(0, 120) ||
    '';
  const preview = rawPreview.trim().slice(0, 120);

  return {
    messageId,
    dataStart,
    scrollY: window.scrollY,
    selectedText: selectedText ? selectedText.slice(0, 500) : null,
    preview,
  };
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
