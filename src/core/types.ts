export interface Bookmark {
  id: string;
  conversationId: string;      // e.g. "chatgpt:abc-def-123"
  hostname: string;            // e.g. "chatgpt.com"
  messageId: string;           // value of data-message-id on the message container
  dataStart: number | null;    // value of data-start on the nearest <p>; null if none found (e.g. code block)
  scrollY: number;             // raw scroll offset — last-resort fallback only
  selectedText: string | null; // user's text selection at save time, capped at 500 chars
  preview: string;             // ≤120 chars shown in the drawer card
  createdAt: number;           // Unix timestamp in milliseconds
}

export interface AnchorData {
  messageId: string;
  dataStart: number | null;
  scrollY: number;
  selectedText: string | null;
  preview: string;
}

export interface Adapter {
  id: string;
  matches(url: URL): boolean;
  getConversationId(url: URL): string;
  getStableConversationId?(url: URL): string | null;
  getMessageContainerSelector(): string;
  getParagraphSelector(): string;
  // Granularity for text-based anchoring/preview. Defaults to 'p, pre, li'.
  getTextBlockSelector?(): string;
  // Element that actually scrolls, when it is not the window. Defaults to null.
  getScrollContainer?(): Element | null;
}
