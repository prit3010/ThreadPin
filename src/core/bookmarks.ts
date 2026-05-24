import type { Adapter, AnchorData, Bookmark } from './types';

export function captureAnchor(adapter: Adapter): AnchorData {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() || null;
  const viewportCenter = window.innerHeight / 2;

  // Find the message container closest to the viewport center
  const containers = Array.from(
    document.querySelectorAll(adapter.getMessageContainerSelector())
  );

  const nearestContainer = containers.reduce<Element | null>(
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

  const dataStart = parseInt(
    nearestP?.getAttribute('data-start') ?? '0',
    10
  );

  const rawPreview = selectedText || nearestP?.textContent || '';
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
