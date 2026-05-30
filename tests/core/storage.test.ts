// tests/core/storage.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeMock } from '../setup';
import {
  getAllBookmarks,
  getConversationBookmarks,
  saveBookmark,
  deleteBookmark,
  getActiveBookmark,
  getBookmarkHandlePosition,
  getThreadPinUiState,
  saveBookmarkHandlePosition,
  saveThreadPinUiState,
} from '../../src/core/storage';
import type { Bookmark } from '../../src/core/types';

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: crypto.randomUUID(),
    conversationId: 'chatgpt:abc123',
    hostname: 'chatgpt.com',
    messageId: 'msg-1',
    dataStart: 0,
    scrollY: 500,
    selectedText: null,
    preview: 'Test preview',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('storage', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', createChromeMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getAllBookmarks returns empty array when nothing saved', async () => {
    const result = await getAllBookmarks();
    expect(result).toEqual([]);
  });

  it('saveBookmark persists a bookmark', async () => {
    const bookmark = makeBookmark();
    await saveBookmark(bookmark);
    const result = await getAllBookmarks();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(bookmark.id);
  });

  it('deleteBookmark removes a bookmark by id', async () => {
    const b1 = makeBookmark();
    const b2 = makeBookmark({ id: 'keep-me' });
    await saveBookmark(b1);
    await saveBookmark(b2);
    await deleteBookmark(b1.id);
    const result = await getAllBookmarks();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('keep-me');
  });

  it('getConversationBookmarks filters by conversationId', async () => {
    const b1 = makeBookmark({ conversationId: 'chatgpt:abc' });
    const b2 = makeBookmark({ conversationId: 'chatgpt:xyz' });
    await saveBookmark(b1);
    await saveBookmark(b2);
    const result = await getConversationBookmarks('chatgpt:abc');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(b1.id);
  });

  it('getConversationBookmarks returns newest first', async () => {
    const older = makeBookmark({ createdAt: 1000 });
    const newer = makeBookmark({ createdAt: 2000 });
    await saveBookmark(older);
    await saveBookmark(newer);
    const result = await getConversationBookmarks('chatgpt:abc123');
    expect(result[0].createdAt).toBe(2000);
    expect(result[1].createdAt).toBe(1000);
  });

  it('getActiveBookmark returns the most recently created bookmark', async () => {
    const older = makeBookmark({ createdAt: 1000 });
    const newer = makeBookmark({ createdAt: 2000 });
    await saveBookmark(older);
    await saveBookmark(newer);
    const active = await getActiveBookmark('chatgpt:abc123');
    expect(active?.createdAt).toBe(2000);
  });

  it('getActiveBookmark returns null when no bookmarks exist', async () => {
    const active = await getActiveBookmark('chatgpt:nonexistent');
    expect(active).toBeNull();
  });

  it('saveBookmark prunes the oldest bookmark when conversation reaches 10', async () => {
    const oldest = makeBookmark({ id: 'oldest', createdAt: 100 });
    await saveBookmark(oldest);
    for (let i = 1; i < 10; i++) {
      await saveBookmark(makeBookmark({ createdAt: 100 + i * 100 }));
    }
    // 10 bookmarks exist — saving one more must prune the oldest
    await saveBookmark(makeBookmark({ createdAt: 9999 }));
    const result = await getConversationBookmarks('chatgpt:abc123');
    expect(result).toHaveLength(10);
    expect(result.find(b => b.id === 'oldest')).toBeUndefined();
  });

  it('getBookmarkHandlePosition defaults to the middle of the viewport', async () => {
    await expect(getBookmarkHandlePosition()).resolves.toBe(0.5);
  });

  it('saveBookmarkHandlePosition persists a clamped normalized position', async () => {
    await saveBookmarkHandlePosition(1.4);
    await expect(getBookmarkHandlePosition()).resolves.toBe(1);

    await saveBookmarkHandlePosition(-0.2);
    await expect(getBookmarkHandlePosition()).resolves.toBe(0);

    await saveBookmarkHandlePosition(0.25);
    await expect(getBookmarkHandlePosition()).resolves.toBe(0.25);
  });

  it('getThreadPinUiState returns stable defaults', async () => {
    await expect(getThreadPinUiState()).resolves.toEqual({
      dockHidden: false,
      drawerMode: 'closed',
    });
  });

  it('saveThreadPinUiState persists partial updates', async () => {
    await saveThreadPinUiState({
      dockHidden: true,
      drawerMode: 'open',
    });

    await saveThreadPinUiState({ drawerMode: 'minimized' });

    await expect(getThreadPinUiState()).resolves.toEqual({
      dockHidden: true,
      drawerMode: 'minimized',
    });
  });
});
