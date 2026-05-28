# Compact Dock, Draggable Drawer, and Chat Switch Design

## Context

ThreadPin currently exposes two separate right-side controls that look too similar: the bookmark save handle and the drawer tab. The drawer is fixed in place and can only be opened or closed. Users also report that bookmarks appear to reset when switching between ChatGPT chats.

Existing storage already persists bookmarks in `chrome.storage.local` and filters them by `conversationId`. The likely failure is in conversation refresh behavior: the content script depends on URL-change events and can save or render against an unstable conversation ID when ChatGPT is transitioning between chats or before a new chat has a stable `/c/<id>` URL.

## Goals

- Replace the two similar floating controls with one compact dock.
- Make the save and bookmark-list actions visually distinct.
- Let users move the bookmarks drawer.
- Let users minimize the drawer back to the dock.
- Let users hide all ThreadPin UI while keeping a tiny restore affordance.
- Fix chat switching so bookmarks remain scoped to the correct chat and reappear when returning to that chat.

## Non-Goals

- No redesign of bookmark row content or storage schema beyond UI state persistence.
- No cross-conversation bookmark list.
- No keyboard shortcut requirement for hide or restore.
- No support for non-ChatGPT sites beyond preserving current adapter behavior.

## UI Design

ThreadPin will use one compact right-side dock. The dock contains:

- A primary save action, visually emphasized with the accent color.
- A secondary bookmarks/list action, visually quieter and showing the current bookmark count.
- A hide-all action, exposed as a small icon button in the dock.

The actions should not use identical shapes, labels, and colors. The save action should read as the primary action; the list action should read as navigation/opening state.

## Drawer Behavior

The bookmarks drawer becomes a floating panel. Its header is the drag handle and includes:

- A grip affordance.
- The title and bookmark count.
- A minimize button.
- A close button.

Dragging the header moves the drawer and clamps it inside the viewport. The drawer should not jump when dragging starts. The final position is persisted so reopening the drawer uses the last user-chosen position.

Minimize collapses the drawer back into the compact dock. Close hides only the drawer and leaves the dock visible.

## Hide-All Behavior

Hide-all mode hides the dock and drawer. It leaves a tiny right-edge restore tab visible. Clicking the restore tab brings back the dock and keeps the drawer closed.

The restore tab must remain discoverable and clamped to the viewport edge. Hide-all state is persisted so a refresh does not immediately re-expand ThreadPin after the user intentionally hid it.

## Conversation Switching

The content script will track the current stable conversation ID as local state. A stable ChatGPT conversation ID is one derived from `/c/<id>`. Fallback IDs are still allowed for generic adapters, but ChatGPT root or transient paths must not silently become permanent bookmark scopes.

On navigation or detected URL changes:

- Compute the next conversation ID.
- If it differs from the previous ID, refresh the drawer and return button for that conversation.
- If the URL is transient or unstable, avoid saving bookmarks until a stable conversation ID is available.
- Preserve existing bookmarks in storage when switching away from a chat.
- Restore the correct drawer list when switching back to a chat.

The UI will show a toast if the user attempts to save before the chat has a stable conversation URL.

## State

Existing bookmark storage remains in `threadpin_bookmarks`.

Additional UI state can be stored in `chrome.storage.local`, including:

- Dock hidden or visible.
- Drawer open, closed, or minimized.
- Drawer position.

Bookmark handle position storage can be replaced or migrated if the old standalone handle no longer exists.

## Components

- `mountDrawer` owns drawer rendering, drag behavior, minimize/close controls, and list rendering.
- A new or revised dock component owns the compact action cluster, hide-all mode, and restore tab.
- `entrypoints/content.ts` coordinates conversation state, storage refresh, save behavior, and return-button sync.
- Storage helpers own UI state persistence and stable bookmark state access.

## Testing

Component tests should cover:

- Dock renders distinct save and list actions.
- Clicking list opens the drawer.
- Clicking hide hides the dock and drawer and leaves a restore tab.
- Clicking restore brings the dock back.
- Drawer minimize closes the drawer back to dock-visible state.
- Drawer drag updates position and clamps inside the viewport.

Conversation tests should cover:

- Bookmarks saved in chat A are still shown after switching to chat B and back to chat A.
- Drawer refresh runs only against the current conversation ID.
- ChatGPT transient or root URLs do not save bookmarks under a permanent-looking fallback conversation ID.

Storage tests should cover:

- UI state defaults.
- UI state persistence and clamping for drawer position.
- Existing bookmark filtering behavior remains unchanged.

## Risks

ChatGPT navigation can change independently of `pushState`, `replaceState`, and `popstate`. The implementation will include a lightweight location-change fallback in addition to existing URL events. This should be tested without assuming a full page reload.

The compact dock should avoid covering ChatGPT controls on narrow viewports. CSS should keep it right-aligned and small, with stable dimensions to prevent layout shifts.
