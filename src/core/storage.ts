// src/core/storage.ts
import type { Bookmark } from './types';

const STORAGE_KEY = 'threadpin_bookmarks';
const MAX_PER_CONVERSATION = 10;

export async function getAllBookmarks(): Promise<Bookmark[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as Bookmark[]) ?? [];
}

export async function getConversationBookmarks(
  conversationId: string
): Promise<Bookmark[]> {
  const all = await getAllBookmarks();
  return all
    .filter(b => b.conversationId === conversationId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveBookmark(bookmark: Bookmark): Promise<void> {
  const all = await getAllBookmarks();
  const conversationBookmarks = all.filter(
    b => b.conversationId === bookmark.conversationId
  );

  let updated = all;

  if (conversationBookmarks.length >= MAX_PER_CONVERSATION) {
    const oldest = [...conversationBookmarks].sort(
      (a, b) => a.createdAt - b.createdAt
    )[0];
    updated = all.filter(b => b.id !== oldest.id);
  }

  await chrome.storage.local.set({
    [STORAGE_KEY]: [...updated, bookmark],
  });
}

export async function deleteBookmark(id: string): Promise<void> {
  const all = await getAllBookmarks();
  await chrome.storage.local.set({
    [STORAGE_KEY]: all.filter(b => b.id !== id),
  });
}

export async function getActiveBookmark(
  conversationId: string
): Promise<Bookmark | null> {
  const bookmarks = await getConversationBookmarks(conversationId);
  return bookmarks[0] ?? null; // sorted newest-first, so [0] is most recent
}
