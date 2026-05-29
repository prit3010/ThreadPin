# Draggable PIN, Minimal Return Icon, and Dock-Anchored List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ThreadPin's dock draggable up/down (capture follows the PIN), replace the floating "Return to bookmark" pill with a minimal `↩` icon next to the PIN, and open the LIST panel anchored beside the dock so it never overlaps the controls.

**Architecture:** Reorder the dock to `LIST → PIN → ×` and anchor it on the PIN's center; reuse the existing normalized handle-position storage (`getBookmarkHandlePosition`/`saveBookmarkHandlePosition`) for the drag position; fold the return action into the dock as a conditional icon; make the drawer open relative to a dock anchor rect and drop its free-drag/remembered-position behavior.

**Tech Stack:** WXT content script, TypeScript, DOM APIs, `chrome.storage.local`, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-05-30-dock-pin-drag-return-redesign-design.md`

---

## File Map

- Modify `src/core/storage.ts`: remove `drawerPosition` from `ThreadPinUiState`; keep handle-position helpers.
- Modify `tests/core/storage.test.ts`: drop `drawerPosition` expectations.
- Modify `src/components/dock.ts`: reorder buttons, add drag handle + vertical drag anchored on PIN, capture guide line, conditional `↩` return icon, `getAnchorRect`.
- Modify `tests/components/dock.test.ts`: add order, return-icon, drag, and anchor tests.
- Modify `src/components/drawer.ts`: open beside a dock anchor; remove grip/drag/remembered-position.
- Modify `tests/components/drawer.test.ts`: replace drag tests with anchor-positioning tests.
- Modify `entrypoints/content.ts`: capture at PIN fraction, drive return icon via dock, anchor panel beside dock, persist drag fraction.
- Modify `tests/entrypoints/content.test.ts`: assert the new wiring.
- Delete `src/components/return-button.ts`.
- Modify `src/styles/content.css`: dock grip/return/guide styles; remove return-pill + drawer-drag CSS.

---

### Task 1: Drop `drawerPosition` from UI state

**Files:**
- Modify: `src/core/storage.ts`
- Test: `tests/core/storage.test.ts`

- [ ] **Step 1: Update the storage tests**

In `tests/core/storage.test.ts`, replace the entire `getThreadPinUiState returns stable defaults` test, the `getThreadPinUiState defaults invalid stored drawer positions` test, the `saveThreadPinUiState persists partial updates` test, and the `saveThreadPinUiState clamps drawer position to non-negative coordinates` test (the four UI-state tests near the bottom of the file) with these two tests:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/core/storage.test.ts`

Expected: FAIL — `getThreadPinUiState` still returns an object containing `drawerPosition`, so `toEqual` mismatches.

- [ ] **Step 3: Remove `drawerPosition` from storage**

In `src/core/storage.ts`, delete the `DrawerPosition` interface and rewrite the UI-state type, default, and normalizer. Replace this block:

```ts
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
```

with:

```ts
export interface ThreadPinUiState {
  dockHidden: boolean;
  drawerMode: DrawerMode;
}

const DEFAULT_UI_STATE: ThreadPinUiState = {
  dockHidden: false,
  drawerMode: 'closed',
};
```

Then replace `normalizeUiState` and delete `normalizeDrawerPosition`. Replace this block:

```ts
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
```

with:

```ts
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
```

Leave `getBookmarkHandlePosition`, `saveBookmarkHandlePosition`, and `clampNormalized` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/core/storage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/storage.ts tests/core/storage.test.ts
git commit -m "refactor: drop drawerPosition from threadpin ui state"
```

---

### Task 2: Draggable dock with return icon and capture guide

**Files:**
- Modify: `src/components/dock.ts`
- Test: `tests/components/dock.test.ts`

- [ ] **Step 1: Add failing dock tests**

Append these tests inside the `describe('mountDock', ...)` block in `tests/components/dock.test.ts` (after the last existing test, before the closing `});`):

```ts
  it('renders LIST above PIN with PIN above the hide control', () => {
    mountDock({
      bookmarkCount: 2,
      hidden: false,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    const buttons = Array.from(
      document.querySelectorAll('.threadpin-dock button')
    ).map((b) => b.className);
    const listIndex = buttons.findIndex((c) => c.includes('threadpin-dock__list'));
    const pinIndex = buttons.findIndex((c) => c.includes('threadpin-dock__save'));
    const hideIndex = buttons.findIndex((c) => c.includes('threadpin-dock__hide'));

    expect(listIndex).toBeGreaterThanOrEqual(0);
    expect(listIndex).toBeLessThan(pinIndex);
    expect(pinIndex).toBeLessThan(hideIndex);
  });

  it('hides the return icon by default and reveals it via refresh', () => {
    const onReturn = vi.fn();
    const dock = mountDock({
      bookmarkCount: 1,
      hidden: false,
      onReturn,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    const ret = document.querySelector<HTMLButtonElement>('.threadpin-dock__return')!;
    expect(ret).not.toBeNull();
    expect(ret.style.display).toBe('none');

    dock.refresh({ returnVisible: true });
    const shown = document.querySelector<HTMLButtonElement>('.threadpin-dock__return')!;
    expect(shown.style.display).not.toBe('none');

    shown.click();
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('drags the dock by the grip and reports a clamped position fraction', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    const onPositionChange = vi.fn();

    mountDock({
      bookmarkCount: 0,
      hidden: false,
      positionFraction: 0.5,
      onPositionChange,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    const grip = document.querySelector<HTMLElement>('.threadpin-dock__grip')!;
    grip.dispatchEvent(new MouseEvent('mousedown', { clientY: 500, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 800, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onPositionChange).toHaveBeenCalledTimes(1);
    expect(onPositionChange.mock.calls[0][0]).toBeCloseTo(0.8, 5);
  });

  it('clamps the drag fraction within 0..1', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    const onPositionChange = vi.fn();

    mountDock({
      bookmarkCount: 0,
      hidden: false,
      positionFraction: 0.5,
      onPositionChange,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    const grip = document.querySelector<HTMLElement>('.threadpin-dock__grip')!;
    grip.dispatchEvent(new MouseEvent('mousedown', { clientY: 500, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 5000, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onPositionChange.mock.calls[0][0]).toBe(1);
  });

  it('getAnchorRect returns the dock bounding rect', () => {
    const dock = mountDock({
      bookmarkCount: 0,
      hidden: false,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    const el = document.querySelector<HTMLElement>('.threadpin-dock')!;
    el.getBoundingClientRect = () =>
      ({ x: 940, y: 300, left: 940, top: 300, right: 1000, bottom: 460, width: 60, height: 160, toJSON: () => undefined }) as DOMRect;

    expect(dock.getAnchorRect()?.left).toBe(940);
    expect(dock.getAnchorRect()?.height).toBe(160);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/components/dock.test.ts`

Expected: FAIL — no `.threadpin-dock__grip`, no `.threadpin-dock__return`, `getAnchorRect` is not a function, order assertions fail.

- [ ] **Step 3: Rewrite the dock component**

Replace the entire contents of `src/components/dock.ts` with:

```ts
const DOCK_ID = 'threadpin-dock';
const RESTORE_ID = 'threadpin-restore-tab';
const GUIDE_ID = 'threadpin-capture-line';
const LEGACY_BOOKMARK_BUTTON_ID = 'threadpin-bookmark-btn';

let nextInstanceId = 0;
let activeInstanceId = 0;
let activeKeepMountedCleanup: (() => void) | null = null;
let activeKeepMountedOwnerId = 0;
let activeDragCleanup: (() => void) | null = null;

function keepMounted(el: HTMLElement): () => void {
  const observer = new MutationObserver(() => {
    if (typeof document === 'undefined') return;
    if (!document.body.contains(el)) {
      document.body.appendChild(el);
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });
  return () => observer.disconnect();
}

function stopKeepingMounted(ownerId?: number): void {
  if (ownerId !== undefined && activeKeepMountedOwnerId !== ownerId) return;
  activeKeepMountedCleanup?.();
  activeKeepMountedCleanup = null;
  activeKeepMountedOwnerId = 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export interface DockOptions {
  bookmarkCount: number;
  hidden: boolean;
  positionFraction?: number;
  returnVisible?: boolean;
  onSave: () => void;
  onToggleList: () => void;
  onHideAll: () => void;
  onRestore: () => void;
  onReturn?: () => void;
  onPositionChange?: (fraction: number) => void;
}

export interface DockRefresh {
  bookmarkCount?: number;
  hidden?: boolean;
  returnVisible?: boolean;
}

export interface DockAPI {
  refresh(update: DockRefresh): void;
  getAnchorRect(): DOMRect | null;
  unmount(): void;
}

export function mountDock(options: DockOptions): DockAPI {
  stopKeepingMounted();
  activeDragCleanup?.();
  activeDragCleanup = null;
  document.getElementById(DOCK_ID)?.remove();
  document.getElementById(RESTORE_ID)?.remove();
  document.getElementById(LEGACY_BOOKMARK_BUTTON_ID)?.remove();

  const instanceId = ++nextInstanceId;
  activeInstanceId = instanceId;
  let disposed = false;
  let bookmarkCount = options.bookmarkCount;
  let hidden = options.hidden;
  let returnVisible = options.returnVisible ?? false;
  let positionFraction = clamp01(options.positionFraction ?? 0.5);

  let dock: HTMLDivElement | null = null;
  let restore: HTMLButtonElement | null = null;
  let pinEl: HTMLButtonElement | null = null;
  let guideEl: HTMLDivElement | null = null;

  let dragging = false;
  let grabOffsetY = 0;
  let guideHideTimer: ReturnType<typeof setTimeout> | null = null;

  function isCurrent(): boolean {
    return !disposed && activeInstanceId === instanceId;
  }

  function trackMountedElement(el: HTMLElement): void {
    activeKeepMountedCleanup = keepMounted(el);
    activeKeepMountedOwnerId = instanceId;
  }

  function viewportHeight(): number {
    return typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 0;
  }

  function applyPosition(): void {
    if (!dock || !isCurrent()) return;
    const height = viewportHeight();
    const target = positionFraction * height;
    const pinOffset = pinEl ? pinEl.offsetTop + pinEl.offsetHeight / 2 : 0;
    const dockHeight = dock.offsetHeight || 0;
    let top = target - pinOffset;
    const maxTop = Math.max(0, height - dockHeight);
    top = Math.max(0, Math.min(top, maxTop));
    dock.style.top = `${Math.round(top)}px`;
    dock.style.bottom = 'auto';
    dock.style.transform = 'none';
  }

  function ensureGuide(): void {
    if (guideEl) return;
    guideEl = document.createElement('div');
    guideEl.id = GUIDE_ID;
    guideEl.className = 'threadpin-capture-line';
    document.body.appendChild(guideEl);
  }

  function showGuide(y: number): void {
    ensureGuide();
    if (!guideEl) return;
    if (guideHideTimer) {
      clearTimeout(guideHideTimer);
      guideHideTimer = null;
    }
    guideEl.style.top = `${Math.round(y)}px`;
    guideEl.classList.add('threadpin-capture-line--visible');
  }

  function hideGuideSoon(): void {
    if (!guideEl) return;
    guideHideTimer = setTimeout(() => {
      guideEl?.classList.remove('threadpin-capture-line--visible');
    }, 600);
  }

  function onWindowMouseMove(event: MouseEvent): void {
    if (!isCurrent() || !dragging) return;
    const height = viewportHeight();
    const pinCenter = Math.max(0, Math.min(event.clientY - grabOffsetY, height));
    positionFraction = clamp01(height > 0 ? pinCenter / height : 0.5);
    applyPosition();
    showGuide(pinCenter);
  }

  function onWindowMouseUp(): void {
    if (!isCurrent() || !dragging) return;
    dragging = false;
    dock?.classList.remove('threadpin-dock--dragging');
    hideGuideSoon();
    options.onPositionChange?.(positionFraction);
  }

  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);
  activeDragCleanup = () => {
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
  };

  function render(): void {
    if (!isCurrent()) return;

    stopKeepingMounted(instanceId);
    dock?.remove();
    restore?.remove();
    dock = null;
    restore = null;
    pinEl = null;

    if (hidden) {
      restore = document.createElement('button');
      restore.id = RESTORE_ID;
      restore.className = 'threadpin-restore-tab';
      restore.type = 'button';
      restore.textContent = '›';
      restore.setAttribute('aria-label', 'Restore ThreadPin');
      restore.addEventListener('click', options.onRestore);
      document.body.appendChild(restore);
      trackMountedElement(restore);
      return;
    }

    dock = document.createElement('div');
    dock.id = DOCK_ID;
    dock.className = 'threadpin-dock';

    const grip = document.createElement('div');
    grip.className = 'threadpin-dock__grip';
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-label', 'Drag ThreadPin up or down');
    grip.addEventListener('mousedown', (event) => {
      if (!isCurrent()) return;
      event.preventDefault();
      dragging = true;
      grabOffsetY = event.clientY - positionFraction * viewportHeight();
      dock?.classList.add('threadpin-dock--dragging');
      showGuide(positionFraction * viewportHeight());
    });

    const list = document.createElement('button');
    list.type = 'button';
    list.className = 'threadpin-dock__list';
    list.textContent = `LIST ${bookmarkCount}`;
    list.setAttribute('aria-label', 'Toggle bookmarks drawer');
    list.addEventListener('click', options.onToggleList);

    const pinWrap = document.createElement('div');
    pinWrap.className = 'threadpin-dock__pin-wrap';

    const ret = document.createElement('button');
    ret.type = 'button';
    ret.className = 'threadpin-dock__return';
    ret.textContent = '↩';
    ret.title = 'Return to bookmark';
    ret.setAttribute('aria-label', 'Return to bookmark');
    if (!returnVisible) ret.style.display = 'none';
    ret.addEventListener('click', () => options.onReturn?.());

    pinEl = document.createElement('button');
    pinEl.type = 'button';
    pinEl.className = 'threadpin-dock__save';
    pinEl.textContent = 'PIN';
    pinEl.setAttribute('aria-label', 'Bookmark current reading position');
    pinEl.addEventListener('click', options.onSave);

    pinWrap.appendChild(ret);
    pinWrap.appendChild(pinEl);

    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'threadpin-dock__hide';
    hide.textContent = '×';
    hide.setAttribute('aria-label', 'Hide ThreadPin');
    hide.addEventListener('click', options.onHideAll);

    dock.appendChild(grip);
    dock.appendChild(list);
    dock.appendChild(pinWrap);
    dock.appendChild(hide);
    document.body.appendChild(dock);
    trackMountedElement(dock);
    applyPosition();
  }

  render();

  return {
    refresh(update) {
      if (!isCurrent()) return;
      bookmarkCount = update.bookmarkCount ?? bookmarkCount;
      hidden = update.hidden ?? hidden;
      returnVisible = update.returnVisible ?? returnVisible;
      render();
    },
    getAnchorRect() {
      return dock ? dock.getBoundingClientRect() : null;
    },
    unmount() {
      if (disposed) return;
      disposed = true;
      if (activeInstanceId !== instanceId) return;

      activeInstanceId = 0;
      stopKeepingMounted(instanceId);
      activeDragCleanup?.();
      activeDragCleanup = null;
      if (guideHideTimer) clearTimeout(guideHideTimer);
      guideEl?.remove();
      guideEl = null;
      dock?.remove();
      restore?.remove();
      dock = null;
      restore = null;
      pinEl = null;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/components/dock.test.ts`

Expected: PASS for all dock tests (existing and new).

- [ ] **Step 5: Commit**

```bash
git add src/components/dock.ts tests/components/dock.test.ts
git commit -m "feat: draggable dock with return icon and capture guide"
```

---

### Task 3: Anchor the drawer beside the dock

**Files:**
- Modify: `src/components/drawer.ts`
- Test: `tests/components/drawer.test.ts`

- [ ] **Step 1: Replace the drawer tests**

Replace the entire contents of `tests/components/drawer.test.ts` with:

```ts
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

  it('shows a no-results state when filter matches no bookmarks', () => {
    const drawer = mountDrawer({ onJump: vi.fn(), onDelete: vi.fn() });

    drawer.refresh([makeBookmark({ id: 'critical', preview: 'Critical section checklist' })]);

    const filter = document.querySelector<HTMLInputElement>('.threadpin-drawer__filter')!;
    filter.value = 'not found';
    filter.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.body.textContent).toContain('No matching bookmarks.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/components/drawer.test.ts`

Expected: FAIL — `open` does not accept an anchor and the drawer still positions via the old `initialPosition`/clamp logic.

- [ ] **Step 3: Rewrite the drawer component**

Replace the entire contents of `src/components/drawer.ts` with:

```ts
// src/components/drawer.ts
import type { Bookmark } from '../core/types';

const DRAWER_ID = 'threadpin-drawer';
const LEGACY_TAB_ID = 'threadpin-drawer-tab';
const ANCHOR_GAP_PX = 12;

let nextInstanceId = 0;
let activeInstanceId = 0;
let activeCleanup: (() => void) | null = null;

function keepMounted(el: HTMLElement): () => void {
  const observer = new MutationObserver(() => {
    if (typeof document === 'undefined') return;
    if (!document.body.contains(el)) {
      document.body.appendChild(el);
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });
  return () => observer.disconnect();
}

function cleanupActiveDrawer(): void {
  activeCleanup?.();
  activeCleanup = null;
}

export interface DrawerAnchor {
  left: number;
  top: number;
  height: number;
}

export interface DrawerOptions {
  onJump: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onMinimize?: () => void;
  onClose?: () => void;
}

export interface DrawerAPI {
  refresh(bookmarks: Bookmark[]): void;
  open(anchor?: DrawerAnchor): void;
  close(): void;
  unmount(): void;
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function mountDrawer(options: DrawerOptions): DrawerAPI {
  cleanupActiveDrawer();
  document.querySelectorAll(`#${DRAWER_ID}`).forEach(el => el.remove());
  document.querySelectorAll(`#${LEGACY_TAB_ID}`).forEach(el => el.remove());

  const instanceId = ++nextInstanceId;
  activeInstanceId = instanceId;

  let disposed = false;
  let currentBookmarks: Bookmark[] = [];
  let filterValue = '';
  let lastAnchor: DrawerAnchor | null = null;

  const drawer = document.createElement('div');
  drawer.id = DRAWER_ID;
  drawer.className = 'threadpin-drawer threadpin-drawer--closed';

  const header = document.createElement('div');
  header.className = 'threadpin-drawer__header';

  const title = document.createElement('h2');
  title.className = 'threadpin-drawer__title';
  title.textContent = 'Bookmarks';

  const count = document.createElement('span');
  count.className = 'threadpin-drawer__count';
  count.textContent = '0 saved';

  const headerMain = document.createElement('div');
  headerMain.className = 'threadpin-drawer__header-main';
  headerMain.appendChild(title);
  headerMain.appendChild(count);

  const minimizeBtn = document.createElement('button');
  minimizeBtn.type = 'button';
  minimizeBtn.className = 'threadpin-drawer__minimize';
  minimizeBtn.textContent = '-';
  minimizeBtn.setAttribute('aria-label', 'Minimize bookmarks drawer');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'threadpin-drawer__close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close bookmarks drawer');

  header.appendChild(headerMain);
  header.appendChild(minimizeBtn);
  header.appendChild(closeBtn);

  const filter = document.createElement('input');
  filter.className = 'threadpin-drawer__filter';
  filter.type = 'search';
  filter.placeholder = 'Filter by preview text';
  filter.setAttribute('aria-label', 'Filter bookmarks');

  const list = document.createElement('div');
  list.className = 'threadpin-drawer__list';

  drawer.appendChild(header);
  drawer.appendChild(filter);
  drawer.appendChild(list);
  document.body.appendChild(drawer);
  const stopKeepingMounted = keepMounted(drawer);

  function isCurrent(): boolean {
    return !disposed && activeInstanceId === instanceId;
  }

  function positionBeside(anchor: DrawerAnchor): void {
    if (!isCurrent()) return;
    const rect = drawer.getBoundingClientRect();
    const width = rect.width || 320;
    const height = rect.height || 320;
    let left = anchor.left - ANCHOR_GAP_PX - width;
    let top = anchor.top + anchor.height / 2 - height / 2;
    left = Math.max(0, Math.round(left));
    const maxTop = Math.max(0, window.innerHeight - Math.min(height, window.innerHeight));
    top = Math.max(0, Math.min(Math.round(top), maxTop));
    drawer.style.left = `${left}px`;
    drawer.style.top = `${top}px`;
    drawer.style.right = 'auto';
    drawer.style.transform = 'none';
  }

  function openDrawer(anchor?: DrawerAnchor): void {
    if (!isCurrent()) return;
    if (anchor) lastAnchor = anchor;
    drawer.classList.remove('threadpin-drawer--closed');
    if (lastAnchor) positionBeside(lastAnchor);
  }

  function closeDrawer(): void {
    if (!isCurrent()) return;
    drawer.classList.add('threadpin-drawer--closed');
  }

  function renderList(bookmarks: Bookmark[]) {
    if (!isCurrent()) return;
    currentBookmarks = bookmarks;
    count.textContent = `${bookmarks.length} saved`;
    list.innerHTML = '';

    if (bookmarks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'threadpin-drawer__empty';
      empty.textContent = 'No bookmarks yet. Click PIN to save your place.';
      list.appendChild(empty);
      return;
    }

    const filtered = bookmarks.filter(bookmark =>
      bookmark.preview.toLowerCase().includes(filterValue.toLowerCase())
    );

    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'threadpin-drawer__empty';
      empty.textContent = 'No matching bookmarks.';
      list.appendChild(empty);
      return;
    }

    const section = document.createElement('div');
    section.className = 'threadpin-drawer__section-label';
    section.textContent = filterValue ? 'Filtered' : 'Newest first';
    list.appendChild(section);

    filtered.forEach((bookmark) => {
      const row = document.createElement('div');
      row.className = 'threadpin-drawer__row';
      if (bookmarks.indexOf(bookmark) === 0) {
        row.classList.add('threadpin-drawer__row--active');
      }

      const preview = document.createElement('p');
      preview.className = 'threadpin-drawer__preview';
      preview.textContent = bookmark.preview || '(no preview)';

      const meta = document.createElement('span');
      meta.className = 'threadpin-drawer__meta';
      meta.textContent =
        bookmarks.indexOf(bookmark) === 0
          ? `${formatRelativeTime(bookmark.createdAt)} · active`
          : formatRelativeTime(bookmark.createdAt);

      const actions = document.createElement('div');
      actions.className = 'threadpin-drawer__actions';

      const jumpBtn = document.createElement('button');
      jumpBtn.className = 'threadpin-drawer__jump';
      jumpBtn.textContent = '↩';
      jumpBtn.setAttribute('aria-label', `Jump to bookmark: ${bookmark.preview}`);
      jumpBtn.addEventListener('click', () => {
        if (!isCurrent()) return;
        options.onJump(bookmark);
        closeDrawer();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'threadpin-drawer__delete';
      deleteBtn.textContent = '×';
      deleteBtn.setAttribute('aria-label', `Delete bookmark: ${bookmark.preview}`);
      deleteBtn.addEventListener('click', () => {
        if (!isCurrent()) return;
        options.onDelete(bookmark.id);
      });

      actions.appendChild(jumpBtn);
      actions.appendChild(deleteBtn);
      const content = document.createElement('div');
      content.className = 'threadpin-drawer__row-content';
      content.appendChild(preview);
      content.appendChild(meta);
      row.appendChild(content);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  function cleanup(): void {
    if (disposed) return;
    disposed = true;
    stopKeepingMounted();
    drawer.remove();
    if (activeInstanceId === instanceId) {
      activeInstanceId = 0;
      activeCleanup = null;
    }
  }

  renderList([]);

  filter.addEventListener('input', () => {
    if (!isCurrent()) return;
    filterValue = filter.value.trim();
    renderList(currentBookmarks);
  });

  minimizeBtn.addEventListener('click', () => {
    if (!isCurrent()) return;
    closeDrawer();
    options.onMinimize?.();
  });

  closeBtn.addEventListener('click', () => {
    if (!isCurrent()) return;
    closeDrawer();
    options.onClose?.();
  });

  activeCleanup = cleanup;

  const api: DrawerAPI = {
    refresh(bookmarks: Bookmark[]) {
      if (!isCurrent()) return;
      renderList(bookmarks);
    },
    open: openDrawer,
    close: closeDrawer,
    unmount() {
      cleanup();
    },
  };

  return api;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/components/drawer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/drawer.ts tests/components/drawer.test.ts
git commit -m "feat: open bookmarks panel anchored beside the dock"
```

---

### Task 4: Wire the content script

**Files:**
- Modify: `entrypoints/content.ts`
- Test: `tests/entrypoints/content.test.ts`

- [ ] **Step 1: Replace the content-wiring tests**

Replace the entire contents of `tests/entrypoints/content.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const contentSource = readFileSync(
  resolve(__dirname, '../../entrypoints/content.ts'),
  'utf8'
);

function expectSourceToMatch(pattern: RegExp): void {
  expect(contentSource.replace(/\s+/g, ' ')).toMatch(pattern);
}

describe('content script wiring', () => {
  it('uses dock + stable conversation helpers and drops the legacy return button', () => {
    expect(contentSource).toContain("from '../src/components/dock'");
    expect(contentSource).toContain('mountDock({');
    expect(contentSource).toContain('getConversationIdForRender');
    expect(contentSource).toContain('getConversationIdForSave');
    expect(contentSource).toContain('handleConversationMaybeChanged');
    expect(contentSource).not.toContain("from '../src/components/return-button'");
    expect(contentSource).not.toContain('mountReturnButton');
    expect(contentSource).not.toContain("from '../src/components/bookmark-button'");
    expect(contentSource).not.toContain('mountBookmarkButton');
  });

  it('captures at the draggable PIN line using the stored handle fraction', () => {
    expect(contentSource).toContain('getBookmarkHandlePosition');
    expect(contentSource).toContain('saveBookmarkHandlePosition');
    expectSourceToMatch(/const viewportY = Math\.round\(dockFraction \* window\.innerHeight\);/);
    expectSourceToMatch(/captureAnchor\(adapter, viewportY\)/);
  });

  it('drives the return icon from the dock based on the active bookmark', () => {
    expectSourceToMatch(
      /onReturn:\s*async\s*\(\)\s*=>\s*{.*?if\s*\(!activeBookmark\)\s*return;.*?jumpToBookmark\(activeBookmark, adapter\)/
    );
    expectSourceToMatch(/returnVisible:\s*activeBookmark !== null/);
  });

  it('opens the list panel anchored beside the dock', () => {
    expect(contentSource).toContain('openDrawerBesideDock');
    expectSourceToMatch(/const rect = dock\.getAnchorRect\(\);/);
  });

  it('persists the drawer as closed after jumping from a bookmark row', () => {
    expectSourceToMatch(
      /onJump:\s*async\s*\(bookmark\)\s*=>\s*{.*?await jumpToBookmark\(bookmark, adapter\);.*?uiState\s*=\s*\{\s*\.\.\.uiState,\s*drawerMode:\s*'closed'\s*};.*?await saveThreadPinUiState\(\{\s*drawerMode:\s*'closed'\s*}\);/
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entrypoints/content.test.ts`

Expected: FAIL — current content still imports `return-button`, has no `dockFraction`/`viewportY`, `openDrawerBesideDock`, or `returnVisible` wiring.

- [ ] **Step 3: Rewrite the content script**

Replace the entire contents of `entrypoints/content.ts` with:

```ts
// entrypoints/content.ts
import '../src/styles/content.css';
import { getAdapter } from '../src/adapters/index';
import { captureAnchor, createBookmark } from '../src/core/bookmarks';
import { jumpToBookmark } from '../src/core/matching';
import { initNavigation, onUrlChange } from '../src/core/navigation';
import {
  saveBookmark,
  deleteBookmark,
  getConversationBookmarks,
  getActiveBookmark,
  getThreadPinUiState,
  saveThreadPinUiState,
  getBookmarkHandlePosition,
  saveBookmarkHandlePosition,
} from '../src/core/storage';
import {
  getConversationIdForRender,
  getConversationIdForSave,
} from '../src/core/conversation';
import { mountDock } from '../src/components/dock';
import { mountDrawer } from '../src/components/drawer';
import { showToast } from '../src/components/toast';
import type { Bookmark } from '../src/core/types';

// ── Wait for ChatGPT's React app to finish hydrating ─────────────────────
function waitForChatGPT(): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector('main')) {
      resolve();
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.querySelector('main')) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  async main() {
    console.log('[ThreadPin] loaded');

    await waitForChatGPT();

    let currentConversationId: string | null = null;
    let currentBookmarkCount = 0;
    let activeBookmark: Bookmark | null = null;
    let uiState = await getThreadPinUiState();
    let dockFraction = await getBookmarkHandlePosition();

    const drawer = mountDrawer({
      onMinimize: async () => {
        uiState = { ...uiState, drawerMode: 'minimized' };
        await saveThreadPinUiState({ drawerMode: 'minimized' });
      },
      onClose: async () => {
        uiState = { ...uiState, drawerMode: 'closed' };
        await saveThreadPinUiState({ drawerMode: 'closed' });
      },
      onJump: async (bookmark) => {
        const adapter = getAdapter(new URL(window.location.href));
        const found = await jumpToBookmark(bookmark, adapter);
        if (!found) {
          showToast('Could not find exact spot — returned to saved position.');
        }
        uiState = { ...uiState, drawerMode: 'closed' };
        await saveThreadPinUiState({ drawerMode: 'closed' });
      },
      onDelete: async (id) => {
        await deleteBookmark(id);
        await refreshConversationUi();
      },
    });

    const dock = mountDock({
      bookmarkCount: currentBookmarkCount,
      hidden: uiState.dockHidden,
      positionFraction: dockFraction,
      returnVisible: false,
      onSave: async () => {
        await saveCurrentBookmark();
      },
      onReturn: async () => {
        if (!activeBookmark) return;
        const adapter = getAdapter(new URL(window.location.href));
        const found = await jumpToBookmark(activeBookmark, adapter);
        if (!found) {
          showToast('Could not find exact spot — returned to saved position.');
        }
      },
      onPositionChange: async (fraction) => {
        dockFraction = fraction;
        await saveBookmarkHandlePosition(fraction);
      },
      onToggleList: async () => {
        if (uiState.drawerMode === 'open') {
          drawer.close();
          uiState = { ...uiState, drawerMode: 'closed' };
          await saveThreadPinUiState({ drawerMode: 'closed' });
          return;
        }
        openDrawerBesideDock();
        uiState = { ...uiState, drawerMode: 'open', dockHidden: false };
        await saveThreadPinUiState({ drawerMode: 'open', dockHidden: false });
      },
      onHideAll: async () => {
        drawer.close();
        uiState = { ...uiState, dockHidden: true, drawerMode: 'closed' };
        await saveThreadPinUiState({ dockHidden: true, drawerMode: 'closed' });
        dock.refresh({ hidden: true, returnVisible: false });
      },
      onRestore: async () => {
        uiState = { ...uiState, dockHidden: false, drawerMode: 'closed' };
        await saveThreadPinUiState({ dockHidden: false, drawerMode: 'closed' });
        dock.refresh({ hidden: false });
        await refreshConversationUi();
      },
    });

    function openDrawerBesideDock(): void {
      const rect = dock.getAnchorRect();
      drawer.open(
        rect ? { left: rect.left, top: rect.top, height: rect.height } : undefined
      );
    }

    async function saveCurrentBookmark(): Promise<void> {
      const url = new URL(window.location.href);
      const adapter = getAdapter(url);
      const conversationId = getConversationIdForSave(adapter, url);
      if (!conversationId) {
        showToast('Open a saved chat before bookmarking.');
        return;
      }

      const viewportY = Math.round(dockFraction * window.innerHeight);
      const anchor = captureAnchor(adapter, viewportY);
      const bookmark = createBookmark(conversationId, url.hostname, anchor);

      await saveBookmark(bookmark);
      showToast('Bookmarked this spot.');
      await refreshConversationUi();
    }

    async function refreshConversationUi(): Promise<void> {
      const url = new URL(window.location.href);
      const adapter = getAdapter(url);
      const conversationId = getConversationIdForRender(adapter, url);
      currentConversationId = conversationId;
      const bookmarks = await getConversationBookmarks(conversationId);
      currentBookmarkCount = bookmarks.length;
      drawer.refresh(bookmarks);

      if (uiState.dockHidden) {
        activeBookmark = null;
        dock.refresh({
          bookmarkCount: currentBookmarkCount,
          hidden: true,
          returnVisible: false,
        });
        return;
      }

      activeBookmark = await getActiveBookmark(conversationId);
      dock.refresh({
        bookmarkCount: currentBookmarkCount,
        hidden: false,
        returnVisible: activeBookmark !== null,
      });
    }

    async function handleConversationMaybeChanged(): Promise<void> {
      const url = new URL(window.location.href);
      const nextConversationId = getConversationIdForRender(getAdapter(url), url);
      if (nextConversationId === currentConversationId) return;
      activeBookmark = null;
      dock.refresh({ returnVisible: false });
      await refreshConversationUi();
    }

    // ── Handle conversation switches (SPA navigation) ─────
    initNavigation();
    onUrlChange(async () => {
      await handleConversationMaybeChanged();
    });

    // ── Initial load ──────────────────────────────────────
    await refreshConversationUi();
    if (uiState.drawerMode === 'open' && !uiState.dockHidden) {
      openDrawerBesideDock();
    }
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/entrypoints/content.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content.ts tests/entrypoints/content.test.ts
git commit -m "feat: capture at PIN line and drive return icon from dock"
```

---

### Task 5: Remove the old return button and restyle

**Files:**
- Delete: `src/components/return-button.ts`
- Modify: `src/styles/content.css`

- [ ] **Step 1: Confirm the return button is unused, then delete it**

Run: `rg -n "return-button|mountReturnButton|ReturnButtonAPI" src entrypoints tests`

Expected: no matches outside `src/components/return-button.ts` itself.

Delete the file:

```bash
git rm src/components/return-button.ts
```

- [ ] **Step 2: Remove the old return-pill CSS**

In `src/styles/content.css`, delete the entire `── Return Button ──` section — every rule block for these selectors:

```text
.threadpin-return-btn
.threadpin-return-btn--hidden
.threadpin-return-btn__label
.threadpin-return-btn__dismiss
.threadpin-return-btn__dismiss:hover
```

- [ ] **Step 3: Remove drawer drag/grip CSS and the grip column**

In `src/styles/content.css`, change the `.threadpin-drawer__header` rule's grid columns from:

```css
  grid-template-columns: 24px minmax(0, 1fr) auto auto;
```

to:

```css
  grid-template-columns: minmax(0, 1fr) auto auto;
```

and remove `cursor: move;` from that same `.threadpin-drawer__header` rule.

Then delete the now-unused `.threadpin-drawer__grip` rule block and the `.threadpin-drawer--dragging` rule block.

- [ ] **Step 4: Add dock grip, return icon, pin-wrap, and capture-line styles**

In `src/styles/content.css`, replace the `.threadpin-dock__hide` rule block:

```css
.threadpin-dock__hide {
  min-width: 38px;
  background: transparent;
  color: var(--tp-text-muted);
}
```

with the following (keeps the hide rule, adds the new pieces):

```css
.threadpin-dock__hide {
  min-width: 38px;
  background: transparent;
  color: var(--tp-text-muted);
}

.threadpin-dock__grip {
  height: 10px;
  margin: -2px auto 2px;
  width: 28px;
  border-radius: 3px;
  background:
    linear-gradient(var(--tp-text-muted), var(--tp-text-muted)) center/20px 2px no-repeat;
  opacity: 0.5;
  cursor: grab;
}

.threadpin-dock__grip:hover {
  opacity: 0.9;
}

.threadpin-dock--dragging,
.threadpin-dock--dragging .threadpin-dock__grip {
  cursor: grabbing;
  user-select: none;
}

.threadpin-dock__pin-wrap {
  position: relative;
  display: flex;
  justify-content: center;
}

.threadpin-dock__return {
  position: absolute;
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--tp-accent);
  background: var(--tp-accent);
  color: #111827;
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
  box-shadow: var(--tp-shadow);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.threadpin-dock__return:hover {
  opacity: 0.9;
}

.threadpin-capture-line {
  position: fixed;
  left: 0;
  right: 0;
  top: 50%;
  z-index: var(--tp-z);
  border-top: 2px dashed var(--tp-accent);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.threadpin-capture-line--visible {
  opacity: 0.8;
}
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`

Expected: PASS (no test imports the deleted return-button).

- [ ] **Step 6: Commit**

The `git rm` in Step 1 already staged the file deletion, so only the CSS needs adding:

```bash
git add src/styles/content.css
git commit -m "refactor: remove return pill and add dock drag/return styles"
```

---

### Task 6: Final verification and manual smoke test

**Files:**
- No planned source edits unless verification finds defects.

- [ ] **Step 1: Run automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all three exit 0. If `typecheck` reports an error about an unused `DrawerPosition` import or a leftover `drawerPosition` reference, fix the named file and re-run.

- [ ] **Step 2: Manual browser smoke test**

Run: `npm run dev`

Then in Chrome (load the WXT dev build) on `https://chatgpt.com/c/<some-chat>`:

```text
1. Dock shows LIST (top), PIN (middle), × (bottom) with a grip bar on top.
2. Grab the grip and drag up/down — a dashed line tracks the PIN; release and it fades.
3. Reload — the dock returns to the dragged height (position remembered).
4. Click PIN — a bookmark is saved at the PIN's line (not the screen middle), LIST count increments, and the ↩ icon appears left of the PIN.
5. Click ↩ — page jumps back to the saved spot.
6. Click LIST — the panel opens to the LEFT of the dock with a gap, not covering the dock/PIN/↩.
7. Drag the dock near the top, open LIST again — the panel stays fully on-screen.
8. Click × (hide) — only the restore tab remains; ↩ and panel are gone.
9. Click restore — dock returns; ↩ reappears if the chat has a bookmark.
10. Switch chats — LIST count and ↩ reflect the new chat.
11. Delete the only bookmark from the panel — ↩ disappears.
```

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only files listed in this plan changed; no stray `.superpowers/` or unrelated docs staged.

- [ ] **Step 4: Final commit if verification required fixes**

If Step 1 or 2 required source fixes, stage only the affected source/test files and commit:

```bash
git add src tests entrypoints
git commit -m "fix: polish dock drag and return redesign verification issues"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Checklist

- **Spec coverage:**
  - Draggable dock anchored on PIN + capture-follows-PIN → Task 2 (drag, `applyPosition`) + Task 4 (`viewportY = dockFraction * innerHeight`).
  - Dock order LIST/PIN/× with PIN centered → Task 2 (render order) + Task 5 (styles).
  - Capture guide line while dragging → Task 2 (`showGuide`/`hideGuideSoon`) + Task 5 (`.threadpin-capture-line`).
  - Position persisted globally, default middle → Task 4 (`getBookmarkHandlePosition`/`saveBookmarkHandlePosition`); storage helpers untouched in Task 1.
  - Minimal `↩` icon left of PIN, conditional, no separate dismiss → Task 2 (return button) + Task 4 (`returnVisible`/`onReturn`) + Task 5 (styles); old pill removed in Task 5.
  - LIST panel anchored beside dock, clamped, no free-drag → Task 3 (`positionBeside`/`open(anchor)`) + Task 4 (`openDrawerBesideDock`).
  - `drawerPosition` removed from UI state → Task 1.
- **Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code; every command has expected output.
- **Type consistency:** `DockOptions`, `DockRefresh`, `DockAPI.getAnchorRect`, `DrawerAnchor`, `DrawerOptions`, `DrawerAPI.open(anchor?)`, `ThreadPinUiState` (no `drawerPosition`), and `dockFraction`/`viewportY`/`activeBookmark` names match across Tasks 1–5.
- **Test isolation:** Each task runs its focused test file; full `npm test` + `typecheck` + `build` run only in Task 6, which is correct because Vitest transpiles per file and cross-file type consistency is only complete after Task 4.
