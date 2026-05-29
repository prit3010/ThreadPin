# Draggable PIN, Minimal Return Icon, and Dock-Anchored List — Design

**Date:** 2026-05-30
**Status:** Approved (pending spec review)

## Overview

Three connected refinements to ThreadPin's floating UI, all centered on the dock:

1. **Draggable dock with capture-follows-PIN.** Reorder the dock to `LIST → PIN → ×` and let the user drag it vertically. The PIN marks the exact line on the page that a bookmark captures, instead of always capturing the viewport middle.
2. **Minimal return icon.** Replace the floating "Return to bookmark" text pill with a small round `↩` icon that sits on the capture line, just left of the PIN.
3. **Dock-anchored list panel.** The LIST drawer always opens to the left of the dock with a gap so it never covers the dock, PIN, or return icon.

## Goals

- Let users aim the bookmark capture point at any vertical position rather than the fixed middle.
- Keep the PIN visually centered in the dock and exactly on the capture line at all times.
- Make the return control minimal and unobtrusive, eliminating the awkward floating gap and the clunky pill divider.
- Make the LIST panel position predictable and never overlap the dock controls.

## Non-Goals

- No change to bookmark storage schema, anchoring/jump resolution, adapters, or SPA navigation.
- No change to the drawer's row content, filtering, minimize, or close behavior.
- No horizontal dragging of the dock (it stays pinned to the right edge).

## Current State

- The dock (`src/components/dock.ts`) renders `PIN → LIST → ×` as a fixed vertical column at `right: 16px; top: 50%` and is **not draggable**.
- Bookmark capture is hardcoded to the viewport middle: `captureAnchor(adapter, Math.round(window.innerHeight / 2))` in `entrypoints/content.ts`. Note `captureAnchor(adapter, viewportY)` already accepts a `viewportY` argument.
- A normalized vertical position helper already exists but is **unused**: `getBookmarkHandlePosition()` / `saveBookmarkHandlePosition()` in `src/core/storage.ts` (clamped `0..1`, default `0.5`).
- The return control is a separate floating pill (`src/components/return-button.ts`) positioned at `right: 88px; top: calc(50% + 88px)` with a dark `×` dismiss divider — it floats apart from the dock.
- The drawer (`src/components/drawer.ts`) is freely draggable, remembers a `drawerPosition` in UI state, and opens at that position (or a default beside the dock). It already reserves a `DOCK_GUTTER_PX = 88` gutter when clamping.

## Design

### 1. Draggable dock with capture-follows-PIN

**Layout.** The dock renders three buttons top-to-bottom: `LIST`, `PIN`, `×`. The PIN is the visual and geometric center of the column.

**Anchoring on the PIN.** The dock is positioned so the **PIN button's vertical center** sits at `fraction × window.innerHeight`, where `fraction` is the stored normalized position (default `0.5`). Because the dock is anchored on the PIN (not its own bounding box), the capture line always runs exactly through the PIN regardless of the other buttons' heights. Concretely, the dock's `top` is computed as `fraction × innerHeight − (PIN center offset within the dock)`, then clamped so the dock stays fully on-screen.

**Dragging.** The dock gets a dedicated **drag handle** — a thin horizontal grip bar at the top edge of the dock (a small `—` affordance, `cursor: grab`). The user drags vertically by pressing the grip; horizontal position is fixed to the right edge. During a drag:
- A faint full-width horizontal **guide line** is shown at the PIN's center y, indicating exactly where a bookmark will save.
- On release, the new `fraction` (PIN center y ÷ innerHeight, clamped `0..1`) is persisted via `saveBookmarkHandlePosition`.
- The guide line fades out shortly after release.

Using a dedicated grip (rather than dragging the buttons themselves) keeps PIN/LIST/× clicks unambiguous.

**Capture.** `saveCurrentBookmark` captures at the PIN's line: `captureAnchor(adapter, Math.round(fraction × window.innerHeight))`.

**Persistence & defaults.** The `fraction` is global per browser profile (not per conversation), loaded on mount via `getBookmarkHandlePosition`, default `0.5` (middle). It survives reloads and conversation switches.

**Click vs. drag.** Because dragging is initiated only from the dedicated grip, button clicks (PIN/LIST/×) are never confused with a drag. A near-zero-movement press on the grip is a no-op.

### 2. Minimal return icon (replaces the pill)

- `src/components/return-button.ts` and its CSS are **removed**. The return action becomes part of the dock surface.
- A small round `↩` icon button renders on the capture line, **just left of the PIN**, as part of the dock so it moves with the dock when dragged.
- **Visibility:** the icon shows only when the current conversation has an active bookmark. It hides when: the dock is hidden, the conversation changes to one with no active bookmark, or all bookmarks in the current conversation are deleted. This matches the existing Return Button visibility rules minus the manual dismiss.
- **No separate dismiss.** The previous per-pill `×` dismiss is dropped; the dock's existing `×` (hide-all) covers hiding the whole surface.
- **Discoverability:** the icon carries an accessible label / `title` (e.g. "Return to bookmark") since it has no text.
- **Action:** clicking it jumps to the active bookmark (same `jumpToBookmark` flow as today, including the "couldn't find exact spot" toast fallback).

### 3. Dock-anchored list panel

- Clicking LIST opens the drawer **to the left of the dock with a fixed gap**, computed from the dock's current bounding rect each time it opens, so it never covers the dock, PIN, or return icon.
- The panel is vertically aligned near the dock and **clamped** to stay fully on-screen when the dock is near the top or bottom.
- The drawer's **free-drag and remembered `drawerPosition` are removed.** The panel always anchors to the dock (predictable, no manual positioning). The drag header grip is removed; **minimize and close are kept.**
- `drawerPosition` is removed from `ThreadPinUiState`; `drawerMode` (`open` / `closed` / `minimized`) is retained.

## Data / Storage Changes

- **Reuse** `getBookmarkHandlePosition` / `saveBookmarkHandlePosition` (normalized `0..1`) for the dock's vertical position. No new key needed (`threadpin_bookmark_handle_position` already exists).
- **Remove** `drawerPosition` from `ThreadPinUiState` and its normalization. Migrate gracefully: ignore any previously stored `drawerPosition`.

## Affected Files

| File | Change |
|------|--------|
| `src/components/dock.ts` | Reorder to LIST/PIN/×; add `↩` return icon (conditional) with `onReturn`; vertical drag anchored on PIN center; capture guide line; `setReturnVisible` + position APIs |
| `src/components/return-button.ts` | **Remove** (folds into dock) |
| `src/components/drawer.ts` | Open anchored beside the dock; remove free-drag, grip, and `onPositionChange`/`initialPosition`; keep minimize/close |
| `entrypoints/content.ts` | Load dock fraction; capture at PIN line; persist fraction on drag; wire return icon; anchor panel beside dock; drop drawerPosition wiring |
| `src/core/storage.ts` | Remove `drawerPosition` from UI state type + normalization; keep handle-position helpers |
| `src/styles/content.css` | Restyle dock (order, drag affordance), return icon, guide line; remove return-pill + drawer-drag CSS |
| Tests | Update `dock`, `drawer`, `storage`, and content tests; remove `return-button` tests |

## Behavior & Edge Cases

- **Default position:** middle (`0.5`) on first use.
- **Clamping:** the PIN line and dock stay on-screen; dragging to the very top/bottom clamps so the dock is never partly cut off.
- **Hidden dock:** when hidden via `×`, the restore tab behavior is unchanged; return icon and panel are hidden.
- **Window resize:** position is stored as a fraction, so it scales with viewport height automatically; on resize the dock re-anchors from the fraction.
- **Conversation switch:** dock position persists (global); return icon and panel reflect the new conversation's bookmarks.
- **Save on a chat without a stable conversation id:** unchanged — still shows the "open a saved chat" toast.

## Testing Strategy

- **storage:** UI state no longer includes `drawerPosition`; previously stored values are ignored. Handle-position clamp/default still covered.
- **dock:** renders order LIST/PIN/×; return icon hidden by default and shown via API; clicking return fires `onReturn`; vertical drag updates position and reports a clamped fraction; click-vs-drag threshold prevents accidental button activation.
- **drawer:** opens anchored beside a given dock rect with the gutter gap; clamps on-screen; minimize/close still work; no drag handlers.
- **content (entrypoint):** capture uses `fraction × innerHeight`; return icon visibility follows active-bookmark rules; panel anchors to dock on open.

## Open Decisions (resolved)

- Capture follows the PIN (not cosmetic). ✓
- Dock order LIST/PIN/×, PIN centered and anchored on the line. ✓
- Return = round `↩` icon left of PIN (A1), no separate dismiss. ✓
- LIST panel always anchors beside the dock (free-drag removed). ✓
