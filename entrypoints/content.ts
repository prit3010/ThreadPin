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
