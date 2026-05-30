# Claude.ai Adapter — Design

**Date:** 2026-05-30
**Status:** Approved for planning

## Goal

Make ThreadPin's bookmarking work on the **claude.ai web app** (not Claude Code) by adding a site adapter, plus the minimal core changes needed to anchor and return to a reading position on a page that exposes no stable per-message or per-paragraph IDs.

## Background — what claude.ai's DOM exposes

Captured from a live conversation (`claude.ai/chat/{uuid}`):

- **Conversation URL:** `https://claude.ai/chat/{uuid}` → clean, stable ID source.
- **Not virtualized:** the full conversation is in the DOM (all 17 user messages present at once). Off-screen messages are *not* unmounted, so in-DOM element lookup and text search work for the whole conversation.
- **No `data-message-id`** on message containers and **no `data-start`** on paragraphs — the two attributes ThreadPin's core currently relies on (`captureAnchor` reads them; `jumpToBookmark` hardcodes `[data-message-id]`/`data-start`).
- **Message containers:**
  - User: `[data-testid="user-message"]`, paragraphs `p.whitespace-pre-wrap` (plus `ol`/`ul`/`li`).
  - Assistant: `div.standard-markdown`, paragraphs `p.font-claude-response-body`, headings `h3`, etc.
- **Code blocks:** `pre.code-block__code > code.language-{lang}`, where **each line is its own top-level `<span>`** child of the `<code>` element. No line IDs, but each line is a discrete, text-bearing element — so we can anchor to an individual code line by its text.
- **Scrolling happens inside `[data-autoscroll-container]`**, not the window. `window.scrollY` / `window.scrollTo` are no-ops here, so the core's raw-scroll fallback must target this element.

## Anchoring strategy

claude.ai has no stable IDs, so we anchor by **captured text**, which ThreadPin already records as `preview` (the text of the block nearest the reading line), plus any `selectedText`.

- **On bookmark:** capture the text of the block nearest the reading line. Block granularity includes code lines (`pre code > span`), so a pin inside a code block records that specific line's text.
- **On return:** search the conversation for that text, scroll it to viewport center, and flash the highlight (same UX as ChatGPT). `scrollIntoView` handles the actual scroll regardless of which element scrolls.

This meets the project's stated accuracy target — *"close enough to find my place visually,"* message-level, not line-level — and in practice lands on the right paragraph/code line for distinctive text.

**Known weak spot:** a very short, duplicated code line (e.g. `rows: 12` repeated across blocks) may match the wrong occurrence. It then degrades to landing on a correct-enough nearby block, and finally to the raw-scroll fallback.

## Design

### 1. New `claudeAdapter` — `src/adapters/claude.ts`

| Member | Value |
|---|---|
| `id` | `'claude'` |
| `matches(url)` | `url.hostname === 'claude.ai'` |
| `getConversationId(url)` | `claude:{uuid}` from `/chat/{uuid}`, else `claude:{pathname}` |
| `getStableConversationId(url)` | `claude:{uuid}` from `/chat/{uuid}`, else `null` |
| `getMessageContainerSelector()` | `[data-testid="user-message"], .standard-markdown` |
| `getParagraphSelector()` | `p, li, h1, h2, h3, pre` (kept for interface; unused for attribute matching) |
| `getTextBlockSelector()` *(new)* | `p, li, h1, h2, h3, pre code > span` — code-line-precise text-anchor granularity |
| `getScrollContainer()` *(new)* | `document.querySelector('[data-autoscroll-container]')` |

Register it in `src/adapters/index.ts` ahead of the generic fallback:
`const ADAPTERS: Adapter[] = [chatgptAdapter, claudeAdapter];`

### 2. Core changes

**`src/core/types.ts` — extend `Adapter`:**
```ts
export interface Adapter {
  // ...existing members...
  getTextBlockSelector?(): string;        // default 'p, pre, li'
  getScrollContainer?(): Element | null;  // default null → window
}
```
No new `Bookmark` fields — text anchoring reuses existing `preview` and `selectedText`.

**`src/core/bookmarks.ts` — `captureAnchor`:**
- Use `adapter.getTextBlockSelector?.() ?? 'p, pre, li'` for the nearest-text / preview computation, so a pin inside a code block captures the specific line's text.
- Read scroll position from the adapter's scroll container when present:
  `const scroller = adapter.getScrollContainer?.(); const scrollY = scroller ? scroller.scrollTop : window.scrollY;`
- `messageId` stays `''` and `dataStart` stays `null` for claude.ai (no matching attributes) — this is expected and drives the text-anchor path.

**`src/core/matching.ts` — `jumpToBookmark`:**
- Strategy 1 (`data-message-id` → `data-start`) is unchanged. claude.ai's empty `messageId` makes `findElementByAttribute` return `null`, so this strategy is naturally skipped.
- **Strategy 2 (text search) upgrade:** search for `bookmark.selectedText ?? bookmark.preview` (today it only uses `selectedText`), using `adapter.getTextBlockSelector?.() ?? 'p, pre, li'` as the block set. This makes a no-selection bookmark locatable by its preview text and adds code-line precision.
- **Strategy 3 (raw scroll) upgrade:** scroll the adapter's scroll container when present, else `window`:
  `const scroller = adapter.getScrollContainer?.(); if (scroller) scroller.scrollTo({ top: bookmark.scrollY, behavior: 'smooth' }); else window.scrollTo(...)`

These changes are backward-compatible: ChatGPT and the generic adapter define neither new method, so they fall back to the current `window` + `p, pre, li` behavior. The added preview-text fallback also makes ChatGPT returns more robust.

### Fallback chain on claude.ai

1. Selected text (if any) found in the conversation → scroll + highlight.
2. Preview text (paragraph or code line) found in the conversation → scroll + highlight.
3. Raw scroll position inside `[data-autoscroll-container]`.

## Testing (Vitest + jsdom)

- **Adapter unit tests** (`tests/`): `matches` for `claude.ai`; `getConversationId` / `getStableConversationId` extract `claude:{uuid}` from `/chat/{uuid}` and handle the no-UUID path; selector getters return expected strings.
- **Capture + jump round-trip** against a fixture DOM mimicking claude.ai: a `[data-testid="user-message"]`, an assistant `.standard-markdown` with `p.font-claude-response-body`, and a `pre code > span` code block inside a `[data-autoscroll-container]`.
  - Capturing on a prose paragraph stores its text in `preview`, `messageId === ''`, `dataStart === null`; jump finds and centers that paragraph.
  - Capturing on a code line stores that line's text; jump centers that code line.
  - Scroll position is read from / written to the autoscroll container, not `window`.
- **Regression:** existing ChatGPT capture/jump tests continue to pass unchanged.

## Out of scope

- Virtualized-list handling (claude.ai currently renders the full conversation; revisit if that changes).
- Anchoring to hidden/unverified attributes (`data-instance-id`, `data-index` — the latter are base-ui tab panels, not message rows).
- Any UI/dock changes — this is adapter + core anchoring only.
