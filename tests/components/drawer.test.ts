import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountDrawer } from '../../src/components/drawer';
import type { Bookmark } from '../../src/core/types';

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 'bookmark-1',
    conversationId: 'chatgpt:abc',
    hostname: 'chatgpt.com',
    messageId: 'msg-1',
    dataStart: 0,
    scrollY: 500,
    selectedText: null,
    preview: 'Critical section checklist',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('mountDrawer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('filters bookmark rows by preview text', () => {
    const drawer = mountDrawer({
      onJump: vi.fn(),
      onDelete: vi.fn(),
    });

    drawer.refresh([
      makeBookmark({ id: 'critical', preview: 'Critical section checklist' }),
      makeBookmark({ id: 'mutex', preview: 'Mutex read lock example' }),
    ]);

    const filter = document.querySelector<HTMLInputElement>('.threadpin-drawer__filter')!;
    filter.value = 'mutex';
    filter.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.body.textContent).not.toContain('Critical section checklist');
    expect(document.body.textContent).toContain('Mutex read lock example');
  });

  it('shows a no-results state when filter matches no bookmarks', () => {
    const drawer = mountDrawer({
      onJump: vi.fn(),
      onDelete: vi.fn(),
    });

    drawer.refresh([
      makeBookmark({ id: 'critical', preview: 'Critical section checklist' }),
    ]);

    const filter = document.querySelector<HTMLInputElement>('.threadpin-drawer__filter')!;
    filter.value = 'not found';
    filter.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.body.textContent).toContain('No matching bookmarks.');
  });
});
