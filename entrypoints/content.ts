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
  getBookmarkHandlePosition,
  saveBookmarkHandlePosition,
} from '../src/core/storage';
import { mountBookmarkButton } from '../src/components/bookmark-button';
import { mountDrawer } from '../src/components/drawer';
import { mountReturnButton } from '../src/components/return-button';
import { showToast } from '../src/components/toast';

// ── Wait for ChatGPT's React app to finish hydrating ─────────────────────
// ChatGPT (Next.js) replaces document.body content ~2s after the content
// script runs. We wait for <main> to appear — that's ChatGPT's signal that
// the app is interactive and won't wipe our appended elements.
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

// ── Guard: re-append element if ChatGPT ever removes it ──────────────────
function keepMounted(el: HTMLElement): void {
  const observer = new MutationObserver(() => {
    if (!document.body.contains(el)) {
      document.body.appendChild(el);
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });
}

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  async main() {
    console.log('[ThreadPin] loaded');

    // Wait for ChatGPT to finish hydrating before mounting any UI
    await waitForChatGPT();

    // ── Mount persistent UI ───────────────────────────────
    const returnBtn = mountReturnButton({
      onReturn: async (bookmark) => {
        const adapter = getAdapter(new URL(window.location.href));
        const found = await jumpToBookmark(bookmark, adapter);
        if (!found) {
          showToast('Could not find exact spot — returned to saved position.');
        }
      },
    });

    const drawer = mountDrawer({
      onJump: async (bookmark) => {
        const adapter = getAdapter(new URL(window.location.href));
        const found = await jumpToBookmark(bookmark, adapter);
        if (!found) {
          showToast('Could not find exact spot — returned to saved position.');
        }
      },
      onDelete: async (id) => {
        await deleteBookmark(id);
        await refreshDrawer();
        await syncReturnButton();
      },
    });

    const initialHandlePosition = await getBookmarkHandlePosition();
    mountBookmarkButton({
      initialPosition: initialHandlePosition,
      onPositionChange: async (position) => {
        await saveBookmarkHandlePosition(position);
      },
      onClick: async ({ viewportY }) => {
        const url = new URL(window.location.href);
        const adapter = getAdapter(url);
        const conversationId = adapter.getConversationId(url);
        const anchor = captureAnchor(adapter, viewportY);
        const bookmark = createBookmark(conversationId, url.hostname, anchor);

        await saveBookmark(bookmark);
        showToast('Bookmarked this spot.');
        returnBtn.show(bookmark);
        await refreshDrawer();
      },
    });

    // ── Helper: refresh drawer with current conversation's bookmarks ──
    async function refreshDrawer(): Promise<void> {
      const url = new URL(window.location.href);
      const adapter = getAdapter(url);
      const conversationId = adapter.getConversationId(url);
      const bookmarks = await getConversationBookmarks(conversationId);
      drawer.refresh(bookmarks);
    }

    // ── Helper: sync return button to the active bookmark ──
    async function syncReturnButton(): Promise<void> {
      const url = new URL(window.location.href);
      const adapter = getAdapter(url);
      const conversationId = adapter.getConversationId(url);
      const active = await getActiveBookmark(conversationId);
      if (active) {
        returnBtn.show(active);
      } else {
        returnBtn.hide();
      }
    }

    // ── Handle conversation switches (SPA navigation) ─────
    initNavigation();
    onUrlChange(async () => {
      // Immediately hide the return button — we're in a new conversation
      returnBtn.hide();
      // Refresh drawer and return button for the new conversation
      await refreshDrawer();
      await syncReturnButton();
    });

    // ── Initial load ──────────────────────────────────────
    await refreshDrawer();
    await syncReturnButton();
  },
});
