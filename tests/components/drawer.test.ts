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

  it('starts closed and exposes open, close, and minimize controls', () => {
    const onMinimize = vi.fn();
    const onClose = vi.fn();
    const drawer = mountDrawer({
      onJump: vi.fn(),
      onDelete: vi.fn(),
      onMinimize,
      onClose,
    });

    expect(document.getElementById('threadpin-drawer')!.className).toContain('threadpin-drawer--closed');

    drawer.open();
    expect(document.getElementById('threadpin-drawer')!.className).not.toContain('threadpin-drawer--closed');

    drawer.close();
    expect(document.getElementById('threadpin-drawer')!.className).toContain('threadpin-drawer--closed');

    drawer.open();
    document.querySelector<HTMLButtonElement>('.threadpin-drawer__minimize')!.click();
    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(document.getElementById('threadpin-drawer')!.className).toContain('threadpin-drawer--closed');

    drawer.open();
    document.querySelector<HTMLButtonElement>('.threadpin-drawer__close')!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.getElementById('threadpin-drawer')!.className).toContain('threadpin-drawer--closed');
  });

  it('drags the drawer by the header and reports clamped position', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    const onPositionChange = vi.fn();

    const drawer = mountDrawer({
      initialPosition: { left: 100, top: 100 },
      onJump: vi.fn(),
      onDelete: vi.fn(),
      onPositionChange,
    });

    drawer.open();
    const header = document.querySelector<HTMLElement>('.threadpin-drawer__header')!;
    header.dispatchEvent(new MouseEvent('mousedown', { clientX: 110, clientY: 110, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 900, clientY: 700, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onPositionChange).toHaveBeenCalledTimes(1);
    const position = onPositionChange.mock.calls[0][0];
    expect(position.left).toBeGreaterThanOrEqual(0);
    expect(position.top).toBeGreaterThanOrEqual(0);
    expect(position.left).toBeLessThanOrEqual(800);
    expect(position.top).toBeLessThanOrEqual(600);
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
