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

function mockDrawerRect(): void {
  const el = document.getElementById('threadpin-drawer')!;
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 300, width: 320, height: 300, toJSON: () => undefined }) as DOMRect;
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

  it('opens to the left of the dock anchor', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });

    const drawer = mountDrawer({ onJump: vi.fn(), onDelete: vi.fn() });
    mockDrawerRect();

    drawer.open({ left: 900, top: 380, height: 120 });

    const el = document.getElementById('threadpin-drawer')!;
    // left = 900 - 12 - 320 = 568 ; top = 380 + 60 - 150 = 290
    expect(el.style.left).toBe('568px');
    expect(el.style.top).toBe('290px');
    expect(el.className).not.toContain('threadpin-drawer--closed');
  });

  it('clamps the panel on-screen when the dock is near the top-right', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });

    const drawer = mountDrawer({ onJump: vi.fn(), onDelete: vi.fn() });
    mockDrawerRect();

    drawer.open({ left: 60, top: 0, height: 40 });

    const el = document.getElementById('threadpin-drawer')!;
    // left = 60 - 12 - 320 = -272 -> 0 ; top = 0 + 20 - 150 = -130 -> 0
    expect(el.style.left).toBe('0px');
    expect(el.style.top).toBe('0px');
  });

  it('removes the legacy drawer tab when mounting', () => {
    const legacyTab = document.createElement('button');
    legacyTab.id = 'threadpin-drawer-tab';
    document.body.appendChild(legacyTab);

    mountDrawer({ onJump: vi.fn(), onDelete: vi.fn() });

    expect(document.getElementById('threadpin-drawer-tab')).toBeNull();
  });

  it('unmount removes drawer and makes later stale API calls inert', () => {
    const drawer = mountDrawer({ onJump: vi.fn(), onDelete: vi.fn() });

    drawer.refresh([makeBookmark({ id: 'critical', preview: 'Critical section checklist' })]);
    drawer.open();
    drawer.unmount();

    expect(document.getElementById('threadpin-drawer')).toBeNull();

    drawer.open();
    drawer.close();
    drawer.refresh([makeBookmark({ id: 'stale', preview: 'Stale bookmark should not render' })]);

    expect(document.getElementById('threadpin-drawer')).toBeNull();
    expect(document.body.textContent).not.toContain('Stale bookmark should not render');
  });

  it('remount makes older API calls inert', () => {
    const firstDrawer = mountDrawer({ onJump: vi.fn(), onDelete: vi.fn() });
    firstDrawer.open();

    const secondDrawer = mountDrawer({ onJump: vi.fn(), onDelete: vi.fn() });
    secondDrawer.open();

    firstDrawer.close();
    firstDrawer.refresh([makeBookmark({ id: 'stale', preview: 'Stale bookmark should not render' })]);

    expect(document.querySelectorAll('#threadpin-drawer')).toHaveLength(1);
    expect(document.getElementById('threadpin-drawer')!.className).not.toContain('threadpin-drawer--closed');
    expect(document.body.textContent).not.toContain('Stale bookmark should not render');
  });

  it('filters bookmark rows by preview text', () => {
    const drawer = mountDrawer({ onJump: vi.fn(), onDelete: vi.fn() });

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

  it('marks the selected active bookmark instead of always marking the newest row', () => {
    const drawer = mountDrawer({ onJump: vi.fn(), onDelete: vi.fn() });

    drawer.refresh([
      makeBookmark({ id: 'newest', preview: 'Newest bookmark' }),
      makeBookmark({ id: 'selected', preview: 'Selected bookmark' }),
    ], 'selected');

    const rows = Array.from(document.querySelectorAll('.threadpin-drawer__row'));
    expect(rows).toHaveLength(2);
    expect(rows[0].className).not.toContain('threadpin-drawer__row--active');
    expect(rows[0].textContent).not.toContain('active');
    expect(rows[1].className).toContain('threadpin-drawer__row--active');
    expect(rows[1].textContent).toContain('active');
  });

  it('shows a no-results state when filter matches no bookmarks', () => {
    const drawer = mountDrawer({ onJump: vi.fn(), onDelete: vi.fn() });

    drawer.refresh([makeBookmark({ id: 'critical', preview: 'Critical section checklist' })]);

    const filter = document.querySelector<HTMLInputElement>('.threadpin-drawer__filter')!;
    filter.value = 'not found';
    filter.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.body.textContent).toContain('No matching bookmarks.');
  });
});
