// src/components/drawer.ts
import type { Bookmark } from '../core/types';

function keepMounted(el: HTMLElement): void {
  const observer = new MutationObserver(() => {
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

  // Drawer panel
  const drawer = document.createElement('div');
  drawer.id = DRAWER_ID;
  drawer.className = 'threadpin-drawer threadpin-drawer--closed';

  const title = document.createElement('div');
  title.className = 'threadpin-drawer__title';
  title.textContent = 'Bookmarks in this chat';

  const list = document.createElement('div');
  list.className = 'threadpin-drawer__list';

  drawer.appendChild(title);
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
    list.innerHTML = '';

    if (bookmarks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'threadpin-drawer__empty';
      empty.textContent =
        'No bookmarks yet. Click "Bookmark here" to save your place.';
      list.appendChild(empty);
      return;
    }

    bookmarks.forEach((bookmark, index) => {
      const card = document.createElement('div');
      card.className = 'threadpin-drawer__card';
      if (index === 0) card.classList.add('threadpin-drawer__card--active');

      const preview = document.createElement('p');
      preview.className = 'threadpin-drawer__preview';
      preview.textContent = bookmark.preview || '(no preview)';

      const meta = document.createElement('span');
      meta.className = 'threadpin-drawer__meta';
      meta.textContent = formatRelativeTime(bookmark.createdAt);

      const actions = document.createElement('div');
      actions.className = 'threadpin-drawer__actions';

      const jumpBtn = document.createElement('button');
      jumpBtn.className = 'threadpin-drawer__jump';
      jumpBtn.textContent = 'Jump';
      jumpBtn.addEventListener('click', () => {
        options.onJump(bookmark);
        isOpen = false;
        drawer.classList.add('threadpin-drawer--closed');
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'threadpin-drawer__delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        options.onDelete(bookmark.id);
      });

      actions.appendChild(jumpBtn);
      actions.appendChild(deleteBtn);
      card.appendChild(preview);
      card.appendChild(meta);
      card.appendChild(actions);
      list.appendChild(card);
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

  return api;
}
