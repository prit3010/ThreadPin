import { describe, it, expect, beforeEach, vi } from 'vitest';
import { captureAnchor, createBookmark } from '../../src/core/bookmarks';
import { chatgptAdapter } from '../../src/adapters/chatgpt';
import { claudeAdapter } from '../../src/adapters/claude';
import type { AnchorData } from '../../src/core/types';

function rect(top: number, bottom: number, width = 100): DOMRect {
  return {
    top,
    bottom,
    height: bottom - top,
    left: 0,
    right: width,
    width,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function buildDom() {
  document.body.innerHTML = `
    <div data-message-id="msg-1" data-message-author-role="assistant">
      <p data-start="0" data-end="100">First paragraph content here.</p>
      <p data-start="101" data-end="200">Second paragraph content here.</p>
    </div>
    <div data-message-id="msg-2" data-message-author-role="user">
      <p data-start="0" data-end="50">User question here.</p>
    </div>
  `;
}

describe('captureAnchor', () => {
  beforeEach(() => {
    buildDom();
    Object.defineProperty(window, 'scrollY', { value: 500, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
    window.getSelection = vi.fn().mockReturnValue({ toString: () => '' });
    // All elements return the same rect — nearest = first one found
    Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 100, bottom: 200, height: 100, left: 0, right: 100, width: 100,
    });
  });

  it('captures scrollY', () => {
    const anchor = captureAnchor(chatgptAdapter);
    expect(anchor.scrollY).toBe(500);
  });

  it('captures messageId from the nearest message container', () => {
    const anchor = captureAnchor(chatgptAdapter);
    expect(anchor.messageId).toBe('msg-1');
  });

  it('captures dataStart from the nearest paragraph', () => {
    const anchor = captureAnchor(chatgptAdapter);
    expect(anchor.dataStart).toBe(0);
  });

  it('captures the reading line offset inside a tall message', () => {
    const message = document.querySelector('[data-message-id="msg-1"]')!;
    const firstParagraph = message.querySelector('[data-start="0"]')!;
    const secondMessage = document.querySelector('[data-message-id="msg-2"]')!;

    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this === message) return rect(-1000, 1600);
      if (this === firstParagraph) return rect(350, 420);
      if (this === secondMessage) return rect(1700, 1900);
      return rect(0, 0, 0);
    });

    const anchor = captureAnchor(chatgptAdapter, 400);

    expect(anchor.messageId).toBe('msg-1');
    expect(anchor.messageOffsetY).toBe(1400);
    expect(anchor.viewportFraction).toBe(0.5);
  });

  it('captures the nearest scroll container position for long virtualized pages', () => {
    document.body.innerHTML = `
      <div id="scroll-root" style="overflow-y: auto;">
        <div data-message-id="msg-1" data-message-author-role="assistant">
          <p data-start="0">Middle of a very long answer.</p>
        </div>
      </div>
    `;

    const scrollRoot = document.getElementById('scroll-root')!;
    Object.defineProperties(scrollRoot, {
      clientHeight: { value: 800, configurable: true },
      scrollHeight: { value: 4000, configurable: true },
    });
    scrollRoot.scrollTop = 1234;

    const message = document.querySelector('[data-message-id="msg-1"]')!;
    const paragraph = document.querySelector('[data-start="0"]')!;
    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this === scrollRoot) return rect(0, 800);
      if (this === message) return rect(100, 1200);
      if (this === paragraph) return rect(350, 420);
      return rect(0, 0, 0);
    });

    const anchor = captureAnchor(chatgptAdapter, 400);

    expect(anchor.scrollContainerTop).toBe(1234);
  });

  it('captures the message closest to an explicit viewport Y coordinate', () => {
    const firstMessage = document.querySelector('[data-message-id="msg-1"]')!;
    const firstParagraph = firstMessage.querySelector('[data-start="0"]')!;
    const secondMessage = document.querySelector('[data-message-id="msg-2"]')!;
    const secondParagraph = secondMessage.querySelector('[data-start="0"]')!;

    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this === firstMessage) return rect(80, 220);
      if (this === firstParagraph) return rect(110, 160);
      if (this === secondMessage) return rect(560, 740);
      if (this === secondParagraph) return rect(620, 680);
      return rect(0, 0, 0);
    });

    const anchor = captureAnchor(chatgptAdapter, 650);

    expect(anchor.messageId).toBe('msg-2');
    expect(anchor.dataStart).toBe(0);
  });

  it('does not capture an off-screen paragraph when the visible bookmark spot has no paragraph anchor', () => {
    document.body.innerHTML = `
      <div data-message-id="msg-code" data-message-author-role="assistant">
        <p data-start="0">Intro paragraph above the viewport.</p>
        <pre>visible code block without a data-start anchor</pre>
        <p data-start="100">Closing paragraph below the viewport.</p>
      </div>
    `;

    const message = document.querySelector('[data-message-id="msg-code"]')!;
    const intro = document.querySelector('[data-start="0"]')!;
    const pre = document.querySelector('pre')!;
    const closing = document.querySelector('[data-start="100"]')!;

    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this === message) {
        return rect(-300, 900);
      }
      if (this === intro) {
        return rect(-250, -200);
      }
      if (this === pre) {
        return rect(250, 550);
      }
      if (this === closing) {
        return rect(850, 900);
      }
      return rect(0, 0, 0);
    });

    const anchor = captureAnchor(chatgptAdapter);

    expect(anchor.messageId).toBe('msg-code');
    expect(anchor.dataStart).toBeNull();
    expect(anchor.preview).toContain('visible code block');
  });

  it('does not borrow dataStart from a different text block than the captured preview', () => {
    document.body.innerHTML = `
      <div data-message-id="msg-transient" data-message-author-role="assistant">
        <p data-start="10">Parser docs that were rendered earlier.</p>
        <p>Now let me update the setup guide.</p>
      </div>
    `;

    const message = document.querySelector('[data-message-id="msg-transient"]')!;
    const anchored = document.querySelector('[data-start="10"]')!;
    const transient = [...document.querySelectorAll('p')].find(
      (p) => p.textContent === 'Now let me update the setup guide.'
    )!;

    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this === message) return rect(100, 500);
      if (this === anchored) return rect(150, 190);
      if (this === transient) return rect(205, 245);
      return rect(0, 0, 0);
    });

    const anchor = captureAnchor(chatgptAdapter, 220);

    expect(anchor.preview).toBe('Now let me update the setup guide.');
    expect(anchor.dataStart).toBeNull();
  });

  it('captures selectedText when user has text highlighted', () => {
    window.getSelection = vi.fn().mockReturnValue({
      toString: () => 'highlighted text',
    });
    const anchor = captureAnchor(chatgptAdapter);
    expect(anchor.selectedText).toBe('highlighted text');
  });

  it('sets selectedText to null when nothing is selected', () => {
    const anchor = captureAnchor(chatgptAdapter);
    expect(anchor.selectedText).toBeNull();
  });

  it('generates preview from nearest paragraph text', () => {
    const anchor = captureAnchor(chatgptAdapter);
    expect(anchor.preview).toBe('First paragraph content here.');
  });

  it('expands inline data-start anchors to the surrounding readable block for preview', () => {
    document.body.innerHTML = `
      <div data-message-id="msg-inline" data-message-author-role="assistant">
        <p>SkillOpt optimizes <strong data-start="20">skills</strong>.</p>
        <p>Agent Gauntlet optimizes <strong data-start="80">the whole harness</strong>.</p>
      </div>
    `;

    const message = document.querySelector('[data-message-id="msg-inline"]')!;
    const inlineSkill = document.querySelector('[data-start="20"]')!;
    const inlineHarness = document.querySelector('[data-start="80"]')!;

    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this === message) return rect(100, 260);
      if (this === inlineSkill) return rect(110, 140);
      if (this === inlineHarness) return rect(190, 220);
      return rect(0, 0, 0);
    });

    const anchor = captureAnchor(chatgptAdapter, 125);

    expect(anchor.dataStart).toBe(20);
    expect(anchor.preview).toBe('SkillOpt optimizes skills.');
  });

  it('truncates preview to 120 characters', () => {
    document.querySelector('p[data-start="0"]')!.textContent = 'A'.repeat(200);
    const anchor = captureAnchor(chatgptAdapter);
    expect(anchor.preview.length).toBeLessThanOrEqual(120);
  });

  it('caps selectedText at 500 characters', () => {
    window.getSelection = vi.fn().mockReturnValue({
      toString: () => 'B'.repeat(600),
    });
    const anchor = captureAnchor(chatgptAdapter);
    expect(anchor.selectedText!.length).toBeLessThanOrEqual(500);
  });

  it('returns empty messageId when no message containers exist', () => {
    document.body.innerHTML = '<div>no adapters here</div>';
    const anchor = captureAnchor(chatgptAdapter);
    expect(anchor.messageId).toBe('');
  });
});

describe('createBookmark', () => {
  it('creates a Bookmark with the correct shape from AnchorData', () => {
    const anchor: AnchorData = {
      messageId: 'msg-1',
      dataStart: 0,
      scrollY: 500,
      selectedText: null,
      preview: 'Test preview',
    };
    const bookmark = createBookmark('chatgpt:abc123', 'chatgpt.com', anchor);
    expect(bookmark.conversationId).toBe('chatgpt:abc123');
    expect(bookmark.hostname).toBe('chatgpt.com');
    expect(bookmark.messageId).toBe('msg-1');
    expect(bookmark.dataStart).toBe(0);
    expect(bookmark.scrollY).toBe(500);
    expect(bookmark.id).toBeTruthy();
    expect(typeof bookmark.id).toBe('string');
    expect(bookmark.createdAt).toBeGreaterThan(0);
  });
});

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

  it('pins the tall assistant message the capture line sits inside, not a smaller closer-centered neighbor', () => {
    // Reproduces the observed bug: the capture line is visually inside a tall
    // assistant answer, but a small user message just below it has a nearer
    // *center*, so the old clamped-center metric wrongly selected the user msg.
    document.body.innerHTML = `
      <div data-autoscroll-container="true">
        <div class="standard-markdown">
          <p class="font-claude-response-body">The assistant answer the user is reading.</p>
        </div>
        <div data-testid="user-message">
          <p class="whitespace-pre-wrap">a short follow-up question</p>
        </div>
      </div>
    `;
    const assistant = document.querySelector('.standard-markdown')!;
    const assistantP = assistant.querySelector('p')!;
    const user = document.querySelector('[data-testid="user-message"]')!;
    const userP = user.querySelector('p')!;

    // Capture line at 200 (innerHeight 800). The assistant container spans
    // 100..900 so the line is INSIDE it, but its clamped visible center is 450
    // (far). The small user message at 240..300 has center 270 — nearer the
    // line under the old metric, so it used to win incorrectly.
    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this === assistant) return rect(100, 900);
      if (this === assistantP) return rect(140, 200);
      if (this === user) return rect(240, 300);
      if (this === userP) return rect(250, 290);
      return rect(0, 0, 0);
    });

    const anchor = captureAnchor(claudeAdapter, 200);
    expect(anchor.preview).toBe('The assistant answer the user is reading.');
  });

  it('captures the table cell at the capture line, not the heading above the table', () => {
    // Reproduces the observed bug: pinning a table row logged the <h3> heading
    // above the table because table cells were not in the text-block selector.
    document.body.innerHTML = `
      <div data-autoscroll-container="true">
        <div class="standard-markdown">
          <h3>Here's the breakdown:</h3>
          <table><tbody>
            <tr>
              <td>Part 2 — Skills</td><td>196 lines</td><td>Create 3 parser skills</td>
            </tr>
          </tbody></table>
        </div>
      </div>
    `;
    const assistant = document.querySelector('.standard-markdown')!;
    const heading = assistant.querySelector('h3')!;
    const cells = assistant.querySelectorAll('td');

    // Capture line at 200 sits on the table row; the heading is above it.
    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this === assistant) return rect(-100, 500);
      if (this === heading) return rect(-50, 0);
      if (this === cells[0] || this === cells[1] || this === cells[2]) return rect(180, 240);
      return rect(0, 0, 0);
    });

    const anchor = captureAnchor(claudeAdapter, 200);
    expect(anchor.preview).toBe('Part 2 — Skills');
  });
});
