// src/core/storage.ts
import type { Bookmark } from './types';

const STORAGE_KEY = 'threadpin_bookmarks';
const HANDLE_POSITION_KEY = 'threadpin_bookmark_handle_position';
const UI_STATE_KEY = 'threadpin_ui_state';
const MAX_PER_CONVERSATION = 10;

export type DrawerMode = 'closed' | 'open' | 'minimized';

export interface DrawerPosition {
  left: number;
  top: number;
}

export interface ThreadPinUiState {
  dockHidden: boolean;
  drawerMode: DrawerMode;
  drawerPosition: DrawerPosition | null;
}

const DEFAULT_UI_STATE: ThreadPinUiState = {
  dockHidden: false,
  drawerMode: 'closed',
  drawerPosition: null,
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
    drawerPosition: normalizeDrawerPosition(value?.drawerPosition),
  };
}

function normalizeDrawerPosition(
  value: DrawerPosition | null | undefined
): DrawerPosition | null {
  if (!value) return null;
  if (!Number.isFinite(value.left) || !Number.isFinite(value.top)) return null;
  return {
    left: Math.max(0, Math.round(value.left)),
    top: Math.max(0, Math.round(value.top)),
  };
}

function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
