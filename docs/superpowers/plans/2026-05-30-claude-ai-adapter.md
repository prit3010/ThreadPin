# Claude.ai Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ThreadPin's bookmark-and-return work on the claude.ai web app by adding a site adapter and the minimal, backward-compatible core changes needed to anchor by text on a page with no stable per-message/per-paragraph IDs.

**Architecture:** A new `claudeAdapter` declares claude.ai's selectors, conversation-ID extraction, a code-line-precise text-block selector, and the scroll container. Two small core changes generalize anchoring: `captureAnchor` reads scroll position from the adapter's scroll container and builds `preview` from the text-block selector; `jumpToBookmark` falls back to searching `preview` text (not just `selectedText`) and scrolls the adapter's container as the last resort. ChatGPT/generic adapters define neither new method, so their behavior is unchanged.

**Tech Stack:** TypeScript, WXT (browser extension), Vitest + jsdom.

**Reference spec:** `docs/superpowers/specs/2026-05-30-claude-ai-adapter-design.md`

---

### Task 1: Create the Claude adapter and extend the Adapter interface

**Files:**
- Modify: `src/core/types.ts` (add two optional methods to `Adapter`)
- Create: `src/adapters/claude.ts`
- Test: `tests/adapters/claude.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/adapters/claude.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { claudeAdapter } from '../../src/adapters/claude';

describe('claudeAdapter', () => {
  it('matches claude.ai', () => {
    expect(claudeAdapter.matches(new URL('https://claude.ai/chat/abc-123'))).toBe(true);
  });

  it('does not match other domains', () => {
    expect(claudeAdapter.matches(new URL('https://chatgpt.com/c/abc'))).toBe(false);
  });

  it('extracts conversation id from /chat/{uuid}', () => {
    const url = new URL('https://claude.ai/chat/e6c64397-d01a-4835-944c-cf62fe07fe28');
    expect(claudeAdapter.getConversationId(url)).toBe(
      'claude:e6c64397-d01a-4835-944c-cf62fe07fe28'
    );
  });

  it('falls back to pathname when no /chat/{id} segment present', () => {
    expect(claudeAdapter.getConversationId(new URL('https://claude.ai/'))).toBe('claude:/');
  });

  it('returns a stable id for /chat/{uuid} and null otherwise', () => {
    expect(
      claudeAdapter.getStableConversationId?.(new URL('https://claude.ai/chat/abc-123'))
    ).toBe('claude:abc-123');
    expect(
      claudeAdapter.getStableConversationId?.(new URL('https://claude.ai/'))
    ).toBeNull();
  });

  it('returns the user + assistant message container selector', () => {
    expect(claudeAdapter.getMessageContainerSelector()).toBe(
      '[data-testid="user-message"], .standard-markdown'
    );
  });

  it('returns a code-line-precise text block selector', () => {
    expect(claudeAdapter.getTextBlockSelector?.()).toBe(
      'p, li, h1, h2, h3, pre code > span'
    );
  });

  it('returns the autoscroll container element when present', () => {
    document.body.innerHTML = '<div data-autoscroll-container="true"><p>hi</p></div>';
    const el = claudeAdapter.getScrollContainer?.();
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-autoscroll-container')).toBe('true');
  });

  it('returns null when no autoscroll container is present', () => {
    document.body.innerHTML = '<div><p>hi</p></div>';
    expect(claudeAdapter.getScrollContainer?.()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/adapters/claude.test.ts`
Expected: FAIL — cannot resolve `../../src/adapters/claude` (module does not exist yet).

- [ ] **Step 3: Extend the Adapter interface**

In `src/core/types.ts`, add two optional methods to the `Adapter` interface (after `getParagraphSelector(): string;`):

```ts
export interface Adapter {
  id: string;
  matches(url: URL): boolean;
  getConversationId(url: URL): string;
  getStableConversationId?(url: URL): string | null;
  getMessageContainerSelector(): string;
  getParagraphSelector(): string;
  // Granularity for text-based anchoring/preview. Defaults to 'p, pre, li'.
  getTextBlockSelector?(): string;
  // Element that actually scrolls, when it is not the window. Defaults to null.
  getScrollContainer?(): Element | null;
}
```

- [ ] **Step 4: Create the Claude adapter**

Create `src/adapters/claude.ts`:

```ts
import type { Adapter } from '../core/types';

function getStableClaudeConversationId(url: URL): string | null {
  const match = url.pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
  return match ? `claude:${match[1]}` : null;
}

export const claudeAdapter: Adapter = {
  id: 'claude',

  matches(url: URL): boolean {
    return url.hostname === 'claude.ai';
  },

  getConversationId(url: URL): string {
    return getStableClaudeConversationId(url) ?? `claude:${url.pathname}`;
  },

  getStableConversationId(url: URL): string | null {
    return getStableClaudeConversationId(url);
  },

  getMessageContainerSelector(): string {
    return '[data-testid="user-message"], .standard-markdown';
  },

  getParagraphSelector(): string {
    return 'p, li, h1, h2, h3, pre';
  },

  getTextBlockSelector(): string {
    return 'p, li, h1, h2, h3, pre code > span';
  },

  getScrollContainer(): Element | null {
    return document.querySelector('[data-autoscroll-container]');
  },
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/adapters/claude.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/adapters/claude.ts tests/adapters/claude.test.ts
git commit -m "feat: add claude.ai site adapter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Register the Claude adapter

**Files:**
- Modify: `src/adapters/index.ts`
- Test: `tests/adapters/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/adapters/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getAdapter } from '../../src/adapters';
import { chatgptAdapter } from '../../src/adapters/chatgpt';
import { claudeAdapter } from '../../src/adapters/claude';

describe('getAdapter', () => {
  it('returns the chatgpt adapter for chatgpt.com', () => {
    expect(getAdapter(new URL('https://chatgpt.com/c/abc'))).toBe(chatgptAdapter);
  });

  it('returns the claude adapter for claude.ai', () => {
    expect(getAdapter(new URL('https://claude.ai/chat/abc'))).toBe(claudeAdapter);
  });

  it('falls back to the generic adapter for unknown hosts', () => {
    expect(getAdapter(new URL('https://example.com/x')).id).toBe('generic');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/adapters/index.test.ts`
Expected: FAIL — `getAdapter(claude.ai)` returns the generic adapter, not `claudeAdapter`.

- [ ] **Step 3: Register the adapter**

Replace the contents of `src/adapters/index.ts` with:

```ts
import type { Adapter } from '../core/types';
import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { genericAdapter } from './generic';

const ADAPTERS: Adapter[] = [chatgptAdapter, claudeAdapter];

export function getAdapter(url: URL): Adapter {
  return ADAPTERS.find(a => a.matches(url)) ?? genericAdapter;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/adapters/index.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/index.ts tests/adapters/index.test.ts
git commit -m "feat: register claude.ai adapter in the adapter registry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Scroll-container-aware capture with text-block previews

**Files:**
- Modify: `src/core/bookmarks.ts` (`captureAnchor`)
- Test: `tests/core/bookmarks.test.ts` (add a `captureAnchor on claude.ai` describe block)

- [ ] **Step 1: Write the failing tests**

At the top of `tests/core/bookmarks.test.ts`, add this import next to the existing imports:

```ts
import { claudeAdapter } from '../../src/adapters/claude';
```

Then append this new describe block at the end of the file (after the `createBookmark` describe):

```ts
describe('captureAnchor on claude.ai', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div data-autoscroll-container="true">
        <div data-testid="user-message">
          <p class="whitespace-pre-wrap">User question text here.</p>
        </div>
        <div class="standard-markdown">
          <p class="font-claude-response-body">Assistant prose paragraph reply.</p>
          <pre class="code-block__code"><code class="language-yaml"><span>rows: 12</span><span>source: invoice.pdf</span></code></pre>
        </div>
      </div>
    `;
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    window.getSelection = vi.fn().mockReturnValue({ toString: () => '' });
  });

  it('reads scroll position from the autoscroll container, not the window', () => {
    const scroller = document.querySelector('[data-autoscroll-container]') as HTMLElement;
    Object.defineProperty(scroller, 'scrollTop', { value: 742, configurable: true });
    Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue(rect(100, 200));

    const anchor = captureAnchor(claudeAdapter);
    expect(anchor.scrollY).toBe(742);
  });

  it('captures empty messageId and null dataStart (no claude attributes)', () => {
    Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue(rect(100, 200));

    const anchor = captureAnchor(claudeAdapter);
    expect(anchor.messageId).toBe('');
    expect(anchor.dataStart).toBeNull();
  });

  it('captures the specific code line as preview when reading inside a code block', () => {
    const userMsg = document.querySelector('[data-testid="user-message"]')!;
    const assistant = document.querySelector('.standard-markdown')!;
    const prose = assistant.querySelector('p')!;
    const codeLines = assistant.querySelectorAll('pre code > span');
    const line0 = codeLines[0]; // 'rows: 12'
    const line1 = codeLines[1]; // 'source: invoice.pdf'

    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this === userMsg) return rect(-400, -300);
      if (this === assistant) return rect(-200, 700);
      if (this === prose) return rect(-150, -100);
      if (this === line0) return rect(380, 420); // centered on viewportY = 400
      if (this === line1) return rect(600, 640);
      return rect(0, 0, 0);
    });

    const anchor = captureAnchor(claudeAdapter, 400);
    expect(anchor.preview).toBe('rows: 12');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/core/bookmarks.test.ts -t "claude.ai"`
Expected: FAIL — `scrollY` is `0` (reads `window.scrollY`, not the container) and `preview` is the whole code block text rather than the single line `'rows: 12'`.

- [ ] **Step 3: Update `captureAnchor`**

In `src/core/bookmarks.ts`, inside `captureAnchor`, just after the two `selection`/`selectedText` lines at the top of the function, add:

```ts
  const scroller = adapter.getScrollContainer?.();
  const scrollY = scroller ? (scroller as HTMLElement).scrollTop : window.scrollY;
  const textBlockSelector = adapter.getTextBlockSelector?.() ?? 'p, pre, li';
```

In the early-return object (the `if (!nearestContainer)` block), change:

```ts
      scrollY: window.scrollY,
```

to:

```ts
      scrollY,
```

Replace the `visibleTextEl` computation block:

```ts
  const visibleTextEl = closestToViewportCenter(
    Array.from(nearestContainer.querySelectorAll('p, pre, li, code'))
      .filter(isVisibleInViewport),
    viewportY
  );
```

with:

```ts
  const nearestTextBlock = closestToViewportY(
    Array.from(nearestContainer.querySelectorAll(textBlockSelector))
      .filter(isVisibleInViewport),
    viewportY
  );
```

Update the `rawPreview` expression — change it from:

```ts
  const rawPreview =
    selectedText ||
    nearestP?.textContent ||
    visibleTextEl?.textContent ||
    nearestContainer.textContent?.trim().slice(0, 120) ||
    '';
```

to (prefer the text-block nearest the reading line, so code lines win over the whole `<pre>`):

```ts
  const rawPreview =
    selectedText ||
    nearestTextBlock?.textContent ||
    nearestP?.textContent ||
    nearestContainer.textContent?.trim().slice(0, 120) ||
    '';
```

In the final returned object, change:

```ts
    scrollY: window.scrollY,
```

to:

```ts
    scrollY,
```

The now-unused `closestToViewportCenter` helper can stay (it is a thin wrapper around `closestToViewportY` and harmless); leave it as-is to keep this change focused.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/core/bookmarks.test.ts`
Expected: PASS — the new `claude.ai` tests pass and all existing `captureAnchor`/`createBookmark` tests still pass (the default `'p, pre, li'` text-block selector and `window.scrollY` fallback preserve ChatGPT behavior).

- [ ] **Step 5: Commit**

```bash
git add src/core/bookmarks.ts tests/core/bookmarks.test.ts
git commit -m "feat: capture scroll container position and text-block previews

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Preview-text and scroll-container aware jump

**Files:**
- Modify: `src/core/matching.ts` (`jumpToBookmark`, `findTextInPage`, `findTextInRoot`)
- Test: `tests/core/matching.test.ts` (add a `jumpToBookmark on claude.ai` describe block)

- [ ] **Step 1: Write the failing tests**

At the top of `tests/core/matching.test.ts`, add this import next to the existing imports:

```ts
import { claudeAdapter } from '../../src/adapters/claude';
```

Then append this new describe block at the end of the file:

```ts
function makeClaudeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 'c-id',
    conversationId: 'claude:abc',
    hostname: 'claude.ai',
    messageId: '',
    dataStart: null,
    scrollY: 742,
    selectedText: null,
    preview: 'Assistant prose paragraph reply.',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('jumpToBookmark on claude.ai', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('finds the bookmark by preview text when there is no selection or message id', async () => {
    document.body.innerHTML = `
      <div data-autoscroll-container="true">
        <div class="standard-markdown">
          <p class="font-claude-response-body">Assistant prose paragraph reply.</p>
        </div>
      </div>
    `;
    const result = await jumpToBookmark(makeClaudeBookmark(), claudeAdapter);
    expect(result).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('finds a specific code line by its preview text', async () => {
    document.body.innerHTML = `
      <div data-autoscroll-container="true">
        <div class="standard-markdown">
          <pre class="code-block__code"><code class="language-yaml"><span>rows: 12</span><span>source: invoice.pdf</span></code></pre>
        </div>
      </div>
    `;
    const result = await jumpToBookmark(
      makeClaudeBookmark({ preview: 'source: invoice.pdf' }),
      claudeAdapter
    );
    expect(result).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('falls back to scrolling the autoscroll container when text is not found', async () => {
    document.body.innerHTML = `
      <div data-autoscroll-container="true">
        <div class="standard-markdown"><p>totally different content</p></div>
      </div>
    `;
    const scroller = document.querySelector('[data-autoscroll-container]') as HTMLElement;
    scroller.scrollTo = vi.fn();
    window.scrollTo = vi.fn();

    const result = await jumpToBookmark(
      makeClaudeBookmark({ preview: 'nowhere-to-be-found-xyz' }),
      claudeAdapter
    );

    expect(result).toBe(false);
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 742, behavior: 'smooth' });
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/core/matching.test.ts -t "claude.ai"`
Expected: FAIL — preview-only bookmarks (no `selectedText`) skip the text search and the raw-scroll fallback calls `window.scrollTo` instead of the container's `scrollTo`.

- [ ] **Step 3: Update `jumpToBookmark` and the text-search helpers**

In `src/core/matching.ts`:

(a) In Strategy 1's inner selected-text search, update the `findTextInRoot` call to pass an explicit text-block selector. Change:

```ts
      const foundInMessage = findTextInRoot(
        bookmark.selectedText,
        messageEl,
        adapter.getParagraphSelector()
      );
```

to:

```ts
      const foundInMessage = findTextInRoot(
        bookmark.selectedText,
        messageEl,
        adapter.getTextBlockSelector?.() ?? 'p, pre, li',
        adapter.getMessageContainerSelector()
      );
```

(b) Replace the entire Strategy 2 block:

```ts
  // Strategy 2: search for selectedText in page containers
  if (bookmark.selectedText) {
    const found = findTextInPage(
      bookmark.selectedText,
      adapter.getMessageContainerSelector()
    );
    if (found) {
      found.scrollIntoView({ behavior: 'instant', block: 'center' });
      flashHighlight(found);
      return true;
    }
  }
```

with (search the selection if present, else the preview text):

```ts
  // Strategy 2: search for anchor text (selection, else preview) in the page
  const anchorText = bookmark.selectedText ?? bookmark.preview;
  if (anchorText) {
    const found = findTextInPage(
      anchorText,
      adapter.getTextBlockSelector?.() ?? 'p, pre, li',
      adapter.getMessageContainerSelector()
    );
    if (found) {
      found.scrollIntoView({ behavior: 'instant', block: 'center' });
      flashHighlight(found);
      return true;
    }
  }
```

(c) Replace the entire Strategy 3 block:

```ts
  // Strategy 3: raw scrollY fallback
  window.scrollTo({ top: bookmark.scrollY, behavior: 'smooth' });
  return false;
```

with (scroll the adapter's container when present, else the window):

```ts
  // Strategy 3: raw scroll-position fallback
  const scroller = adapter.getScrollContainer?.();
  if (scroller) {
    (scroller as Element).scrollTo({ top: bookmark.scrollY, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: bookmark.scrollY, behavior: 'smooth' });
  }
  return false;
```

(d) Update `findTextInPage` to forward a text-block selector. Change:

```ts
function findTextInPage(
  text: string,
  containerSelector: string
): HTMLElement | null {
  return findTextInRoot(text, document, containerSelector);
}
```

to:

```ts
function findTextInPage(
  text: string,
  textBlockSelector: string,
  containerSelector: string
): HTMLElement | null {
  return findTextInRoot(text, document, textBlockSelector, containerSelector);
}
```

(e) Update `findTextInRoot` to take the text-block selector instead of hardcoding `'p, pre, li'`. Change the signature and the `textBlocks` query. From:

```ts
function findTextInRoot(
  text: string,
  root: ParentNode,
  containerSelector: string
): HTMLElement | null {
  const needle = text.slice(0, 50).toLowerCase();
  if (!needle) return null;

  // Search within likely text blocks first for a more precise landing spot.
  const textBlocks = root.querySelectorAll('p, pre, li');
```

to:

```ts
function findTextInRoot(
  text: string,
  root: ParentNode,
  textBlockSelector: string,
  containerSelector: string
): HTMLElement | null {
  const needle = text.slice(0, 50).toLowerCase();
  if (!needle) return null;

  // Search within likely text blocks first for a more precise landing spot.
  const textBlocks = root.querySelectorAll(textBlockSelector);
```

(The rest of `findTextInRoot` — the container-selector fallback loop — is unchanged.)

- [ ] **Step 4: Run the full test suite to verify everything passes**

Run: `npx vitest run`
Expected: PASS — the new `claude.ai` jump tests pass, and all existing `matching` tests still pass (ChatGPT bookmarks carry `selectedText`/`preview`, default to the `'p, pre, li'` text-block selector, and use `window.scrollTo` since `getScrollContainer` is undefined).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/matching.ts tests/core/matching.test.ts
git commit -m "feat: jump via preview text and scroll container fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Manual verification on claude.ai

**Files:** none (manual smoke test of the built extension).

- [ ] **Step 1: Build the extension**

Run: `npm run build`
Expected: WXT build completes without errors; output in `.output/`.

- [ ] **Step 2: Load the unpacked extension and open a claude.ai conversation**

Load the built extension from `.output/` in the browser (chrome://extensions → Load unpacked), then open an existing `claude.ai/chat/{uuid}` conversation with several messages.

- [ ] **Step 3: Verify capture + return on prose**

Scroll to a mid-conversation assistant paragraph, drop a pin, scroll away (to the bottom), then hit return.
Expected: the page scrolls back and flashes the highlight on (or very near) the pinned paragraph.

- [ ] **Step 4: Verify capture + return inside a code block**

Pin a position while a code block is centered in the viewport, scroll away, then return.
Expected: it lands on the code block / the specific line, not the top of the conversation.

- [ ] **Step 5: Verify the drawer and chat-switch behavior**

Confirm the bookmark count/drawer reflects the new bookmarks for this conversation, and that switching to a different `claude.ai/chat/{uuid}` updates the active conversation (no stale return target).
Expected: behavior matches what already works on ChatGPT.

---

## Notes for the implementer

- **No new `Bookmark` fields.** Text anchoring reuses the existing `preview` and `selectedText`. Do not change `src/core/types.ts` beyond the two optional `Adapter` methods in Task 1.
- **Backward compatibility is the safety net.** Every core change keys off `adapter.getTextBlockSelector?.() ?? 'p, pre, li'` and `adapter.getScrollContainer?.()`. ChatGPT and generic adapters implement neither, so they keep the exact prior behavior. If an existing ChatGPT test breaks, the change was not gated correctly — fix the gating, do not edit the test.
- **Run the whole suite after Task 4** (`npx vitest run`), not just the new files, to catch any regression in the shared `bookmarks`/`matching` modules.
