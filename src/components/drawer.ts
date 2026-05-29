// src/components/drawer.ts
import type { Bookmark } from '../core/types';

const DRAWER_ID = 'threadpin-drawer';
const LEGACY_TAB_ID = 'threadpin-drawer-tab';
const DOCK_GUTTER_PX = 88;

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

export interface DrawerPosition {
  left: number;
  top: number;
}

export interface DrawerOptions {
  initialPosition?: DrawerPosition | null;
  onJump: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onMinimize?: () => void;
  onClose?: () => void;
  onPositionChange?: (position: DrawerPosition) => void;
}

export interface DrawerAPI {
  refresh(bookmarks: Bookmark[]): void;
  open(): void;
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

  let isOpen = false;
  let disposed = false;
  let currentBookmarks: Bookmark[] = [];
  let filterValue = '';
  let position = options.initialPosition ?? null;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  // Drawer panel
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

  const grip = document.createElement('span');
  grip.className = 'threadpin-drawer__grip';
  grip.textContent = '::';
  grip.setAttribute('aria-hidden', 'true');

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

  header.appendChild(grip);
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

  function applyPosition(): void {
    if (!isCurrent() || !position) return;
    position = clampDrawerPosition(position.left, position.top);
    drawer.style.left = `${position.left}px`;
    drawer.style.top = `${position.top}px`;
    drawer.style.right = 'auto';
    drawer.style.transform = 'none';
  }

  function clampDrawerPosition(left: number, top: number): DrawerPosition {
    const rect = drawer.getBoundingClientRect();
    const width = rect.width || 390;
    const height = rect.height || 320;
    const maxLeft = Math.max(
      0,
      window.innerWidth - Math.min(width, window.innerWidth) - DOCK_GUTTER_PX
    );
    return {
      left: Math.max(0, Math.min(Math.round(left), maxLeft)),
      top: Math.max(0, Math.min(Math.round(top), window.innerHeight - Math.min(height, window.innerHeight))),
    };
  }

  function openDrawer(): void {
    if (!isCurrent()) return;
    isOpen = true;
    drawer.classList.remove('threadpin-drawer--closed');
    applyPosition();
  }

  function closeDrawer(): void {
    if (!isCurrent()) return;
    isOpen = false;
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
      empty.textContent =
        'No bookmarks yet. Click PIN to save your place.';
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

  const handleMouseMove = (event: MouseEvent) => {
    if (!isCurrent() || !isDragging) return;
    position = clampDrawerPosition(event.clientX - dragOffsetX, event.clientY - dragOffsetY);
    applyPosition();
  };

  const handleMouseUp = () => {
    if (!isCurrent() || !isDragging) return;
    isDragging = false;
    drawer.classList.remove('threadpin-drawer--dragging');
    if (position) options.onPositionChange?.(position);
  };

  function cleanup(): void {
    if (disposed) return;
    disposed = true;
    isDragging = false;
    stopKeepingMounted();
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    drawer.remove();
    if (activeInstanceId === instanceId) {
      activeInstanceId = 0;
      activeCleanup = null;
    }
  }

  // Initial state
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

  header.addEventListener('mousedown', (event) => {
    if (!isCurrent()) return;
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = drawer.getBoundingClientRect();
    isDragging = true;
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    drawer.classList.add('threadpin-drawer--dragging');
  });

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
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
