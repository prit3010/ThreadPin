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
} from '../src/core/storage';
import {
  getConversationIdForRender,
  getConversationIdForSave,
} from '../src/core/conversation';
import { mountDock } from '../src/components/dock';
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

    let currentConversationId: string | null = null;
    let currentBookmarkCount = 0;
    let uiState = await getThreadPinUiState();

    const drawer = mountDrawer({
      initialPosition: uiState.drawerPosition,
      onPositionChange: async (position) => {
        uiState = { ...uiState, drawerPosition: position };
        await saveThreadPinUiState({ drawerPosition: position });
      },
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
      onSave: async () => {
        await saveCurrentBookmark();
      },
      onToggleList: async () => {
        if (uiState.drawerMode === 'open') {
          drawer.close();
          uiState = { ...uiState, drawerMode: 'closed' };
          await saveThreadPinUiState({ drawerMode: 'closed' });
          return;
        }
        drawer.open();
        uiState = { ...uiState, drawerMode: 'open', dockHidden: false };
        await saveThreadPinUiState({ drawerMode: 'open', dockHidden: false });
      },
      onHideAll: async () => {
        drawer.close();
        returnBtn.hide();
        uiState = { ...uiState, dockHidden: true, drawerMode: 'closed' };
        await saveThreadPinUiState({ dockHidden: true, drawerMode: 'closed' });
        dock.refresh({ hidden: true });
      },
      onRestore: async () => {
        uiState = { ...uiState, dockHidden: false, drawerMode: 'closed' };
        await saveThreadPinUiState({ dockHidden: false, drawerMode: 'closed' });
        dock.refresh({ hidden: false });
        await refreshConversationUi();
      },
    });

    async function saveCurrentBookmark(): Promise<void> {
      const url = new URL(window.location.href);
      const adapter = getAdapter(url);
      const conversationId = getConversationIdForSave(adapter, url);
      if (!conversationId) {
        showToast('Open a saved chat before bookmarking.');
        return;
      }

      const anchor = captureAnchor(adapter, Math.round(window.innerHeight / 2));
      const bookmark = createBookmark(conversationId, url.hostname, anchor);

      await saveBookmark(bookmark);
      showToast('Bookmarked this spot.');
      returnBtn.show(bookmark);
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
      dock.refresh({ bookmarkCount: currentBookmarkCount, hidden: uiState.dockHidden });
      if (uiState.dockHidden) {
        returnBtn.hide();
        return;
      }

      const active = await getActiveBookmark(conversationId);
      if (active) {
        returnBtn.show(active);
      } else {
        returnBtn.hide();
      }
    }

    async function handleConversationMaybeChanged(): Promise<void> {
      const url = new URL(window.location.href);
      const nextConversationId = getConversationIdForRender(getAdapter(url), url);
      if (nextConversationId === currentConversationId) return;
      returnBtn.hide();
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
      drawer.open();
    }
  },
});
