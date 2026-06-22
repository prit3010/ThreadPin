// src/core/storage.ts
import type { Bookmark } from './types';

const STORAGE_KEY = 'threadpin_bookmarks';
const HANDLE_POSITION_KEY = 'threadpin_bookmark_handle_position';
const UI_STATE_KEY = 'threadpin_ui_state';
const ACTIVE_BOOKMARKS_KEY = 'threadpin_active_bookmarks';
const MAX_PER_CONVERSATION = 10;

export type DrawerMode = 'closed' | 'open' | 'minimized';

export interface ThreadPinUiState {
  dockHidden: boolean;
  drawerMode: DrawerMode;
}

const DEFAULT_UI_STATE: ThreadPinUiState = {
  dockHidden: false,
  drawerMode: 'closed',
};

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

export async function getActiveBookmarkId(
  conversationId: string
): Promise<string | null> {
  const result = await chrome.storage.local.get(ACTIVE_BOOKMARKS_KEY);
  const activeByConversation = normalizeActiveBookmarks(
    result[ACTIVE_BOOKMARKS_KEY]
  );
  return activeByConversation[conversationId] ?? null;
}

export async function saveActiveBookmarkId(
  conversationId: string,
  bookmarkId: string | null
): Promise<void> {
  const result = await chrome.storage.local.get(ACTIVE_BOOKMARKS_KEY);
  const activeByConversation = normalizeActiveBookmarks(
    result[ACTIVE_BOOKMARKS_KEY]
  );

  if (bookmarkId) {
    activeByConversation[conversationId] = bookmarkId;
  } else {
    delete activeByConversation[conversationId];
  }

  await chrome.storage.local.set({
    [ACTIVE_BOOKMARKS_KEY]: activeByConversation,
  });
}

export async function getBookmarkHandlePosition(): Promise<number> {
  const result = await chrome.storage.local.get(HANDLE_POSITION_KEY);
  const value = result[HANDLE_POSITION_KEY];
  return typeof value === 'number' ? clampNormalized(value) : 0.5;
}

export async function saveBookmarkHandlePosition(position: number): Promise<void> {
  await chrome.storage.local.set({
    [HANDLE_POSITION_KEY]: clampNormalized(position),
  });
}

export async function getThreadPinUiState(): Promise<ThreadPinUiState> {
  const result = await chrome.storage.local.get(UI_STATE_KEY);
  const stored = result[UI_STATE_KEY] as Partial<ThreadPinUiState> | undefined;
  return normalizeUiState(stored);
}

export async function saveThreadPinUiState(
  update: Partial<ThreadPinUiState>
): Promise<void> {
  const current = await getThreadPinUiState();
  await chrome.storage.local.set({
    [UI_STATE_KEY]: normalizeUiState({ ...current, ...update }),
  });
}

function normalizeUiState(
  value: Partial<ThreadPinUiState> | undefined
): ThreadPinUiState {
  const drawerMode =
    value?.drawerMode === 'open' ||
    value?.drawerMode === 'minimized' ||
    value?.drawerMode === 'closed'
      ? value.drawerMode
      : DEFAULT_UI_STATE.drawerMode;

  return {
    dockHidden: value?.dockHidden === true,
    drawerMode,
  };
}

function normalizeActiveBookmarks(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([conversationId, bookmarkId]) =>
        typeof conversationId === 'string' &&
        typeof bookmarkId === 'string' &&
        conversationId.length > 0 &&
        bookmarkId.length > 0
    )
  );
}

function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
