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
  refresh(bookmarks: Bookmark[], activeBookmarkId?: string | null): void;
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
  let currentActiveBookmarkId: string | null = null;
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

  function renderList(bookmarks: Bookmark[], activeBookmarkId: string | null = null) {
    if (!isCurrent()) return;
    currentBookmarks = bookmarks;
    currentActiveBookmarkId = activeBookmarkId;
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
      const isActive = bookmark.id === activeBookmarkId;
      const row = document.createElement('div');
      row.className = 'threadpin-drawer__row';
      if (isActive) {
        row.classList.add('threadpin-drawer__row--active');
      }

      const preview = document.createElement('p');
      preview.className = 'threadpin-drawer__preview';
      preview.textContent = bookmark.preview || '(no preview)';

      const meta = document.createElement('span');
      meta.className = 'threadpin-drawer__meta';
      meta.textContent =
        isActive
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
    renderList(currentBookmarks, currentActiveBookmarkId);
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
    refresh(bookmarks: Bookmark[], activeBookmarkId: string | null = currentActiveBookmarkId) {
      if (!isCurrent()) return;
      renderList(bookmarks, activeBookmarkId);
    },
    open: openDrawer,
    close: closeDrawer,
    unmount() {
      cleanup();
    },
  };

  return api;
}
