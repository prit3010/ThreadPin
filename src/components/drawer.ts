// src/components/drawer.ts
import type { Bookmark } from '../core/types';

function keepMounted(el: HTMLElement): void {
  const observer = new MutationObserver(() => {
    if (typeof document === 'undefined') return;
    if (!document.body.contains(el)) {
      document.body.appendChild(el);
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });
}

const DRAWER_ID = 'threadpin-drawer';
const TAB_ID = 'threadpin-drawer-tab';

export interface DrawerOptions {
  onJump: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
}

export interface DrawerAPI {
  refresh(bookmarks: Bookmark[]): void;
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
  document.getElementById(DRAWER_ID)?.remove();
  document.getElementById(TAB_ID)?.remove();

  let isOpen = false;
  let currentBookmarks: Bookmark[] = [];
  let filterValue = '';

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

  header.appendChild(title);
  header.appendChild(count);

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
  keepMounted(drawer);

  // Drawer tab button (opens/closes the panel)
  const tab = document.createElement('button');
  tab.id = TAB_ID;
  tab.className = 'threadpin-drawer-tab';
  tab.setAttribute('aria-label', 'Toggle bookmark drawer');
  tab.textContent = '📌';
  document.body.appendChild(tab);
  keepMounted(tab);

  tab.addEventListener('click', () => {
    isOpen = !isOpen;
    drawer.classList.toggle('threadpin-drawer--closed', !isOpen);
  });

  function renderList(bookmarks: Bookmark[]) {
    currentBookmarks = bookmarks;
    count.textContent = `${bookmarks.length} saved`;
    list.innerHTML = '';

    if (bookmarks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'threadpin-drawer__empty';
      empty.textContent =
        'No bookmarks yet. Click "Bookmark here" to save your place.';
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
        options.onJump(bookmark);
        isOpen = false;
        drawer.classList.add('threadpin-drawer--closed');
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'threadpin-drawer__delete';
      deleteBtn.textContent = '×';
      deleteBtn.setAttribute('aria-label', `Delete bookmark: ${bookmark.preview}`);
      deleteBtn.addEventListener('click', () => {
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

  function updateTab(count: number) {
    tab.textContent = count > 0 ? `📌 ${count}` : '📌';
  }

  const api: DrawerAPI = {
    refresh(bookmarks: Bookmark[]) {
      renderList(bookmarks);
      updateTab(bookmarks.length);
    },
    unmount() {
      drawer.remove();
      tab.remove();
    },
  };

  // Initial state
  renderList([]);
  updateTab(0);

  filter.addEventListener('input', () => {
    filterValue = filter.value.trim();
    renderList(currentBookmarks);
  });

  return api;
}
