import { describe, it, expect, beforeEach, vi } from 'vitest';
import { jumpToBookmark } from '../../src/core/matching';
import { chatgptAdapter } from '../../src/adapters/chatgpt';
import { claudeAdapter } from '../../src/adapters/claude';
import type { Bookmark } from '../../src/core/types';

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 'test-id',
    conversationId: 'chatgpt:abc',
    hostname: 'chatgpt.com',
    messageId: 'msg-1',
    dataStart: 0,
    scrollY: 500,
    selectedText: 'hello world',
    preview: 'hello world',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('jumpToBookmark', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('returns true and calls scrollIntoView when messageId is found', async () => {
    document.body.innerHTML = `
      <div data-message-id="msg-1">
        <p data-start="0">hello world content</p>
      </div>
    `;
    const result = await jumpToBookmark(makeBookmark(), chatgptAdapter);
    expect(result).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('scrolls to paragraph element when both messageId and dataStart are found', async () => {
    document.body.innerHTML = `
      <div data-message-id="msg-1">
        <p data-start="0">paragraph one</p>
        <p data-start="100">paragraph two</p>
      </div>
    `;
    const result = await jumpToBookmark(makeBookmark({ dataStart: 100 }), chatgptAdapter);
    expect(result).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('uses selected text when the message exists but the saved paragraph anchor no longer exists', async () => {
    document.body.innerHTML = `
      <div data-message-id="msg-1">
        <p data-start="200">updated paragraph with hello world content</p>
      </div>
    `;

    const result = await jumpToBookmark(
      makeBookmark({ dataStart: 100, selectedText: 'hello world content' }),
      chatgptAdapter
    );

    expect(result).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls the saved message into view when there is no paragraph anchor to restore', async () => {
    document.body.innerHTML = `
      <div data-message-id="msg-1">
        <pre>code block content</pre>
      </div>
    `;

    const result = await jumpToBookmark(
      makeBookmark({ dataStart: null, selectedText: null }),
      chatgptAdapter
    );

    expect(result).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('finds message ids containing CSS selector metacharacters', async () => {
    document.body.innerHTML = `
      <div data-message-id='msg-"quoted"'>
        <p data-start="0">hello world content</p>
      </div>
    `;

    const result = await jumpToBookmark(
      makeBookmark({ messageId: 'msg-"quoted"' }),
      chatgptAdapter
    );

    expect(result).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('falls back to scrollY when messageId not found and selectedText is null', async () => {
    document.body.innerHTML = '<div>unrelated content</div>';
    const result = await jumpToBookmark(
      makeBookmark({ messageId: 'nonexistent', selectedText: null }),
      chatgptAdapter
    );
    expect(result).toBe(false);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 500, behavior: 'smooth' });
  });

  it('finds selectedText in the page when messageId is not found', async () => {
    document.body.innerHTML = `
      <div data-message-id="other-msg">
        <p data-start="0">hello world content is here</p>
      </div>
    `;
    const result = await jumpToBookmark(
      makeBookmark({ messageId: 'nonexistent' }),
      chatgptAdapter
    );
    expect(result).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('falls back to scrollY when neither messageId nor selectedText is found', async () => {
    document.body.innerHTML = '<div>completely unrelated text</div>';
    const result = await jumpToBookmark(
      makeBookmark({ messageId: 'nonexistent', selectedText: 'xyz-not-here-at-all' }),
      chatgptAdapter
    );
    expect(result).toBe(false);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 500, behavior: 'smooth' });
  });

  it('jumps to preview text for a chatgpt bookmark when selectedText is null and the message id is stale', async () => {
    document.body.innerHTML = `
      <div data-message-id="some-other-msg">
        <p data-start="0">a paragraph that contains the unique-preview-marker text</p>
      </div>
    `;
    const result = await jumpToBookmark(
      makeBookmark({
        messageId: 'nonexistent',
        selectedText: null,
        preview: 'unique-preview-marker',
      }),
      chatgptAdapter
    );
    expect(result).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('lets a chatgpt text search land on a bare code element (default selector includes code)', async () => {
    document.body.innerHTML = `
      <section>
        <code>npm run unique-code-marker</code>
      </section>
    `;
    const code = document.querySelector('code')!;
    const codeScroll = vi.spyOn(code, 'scrollIntoView');

    const result = await jumpToBookmark(
      makeBookmark({
        messageId: 'nonexistent',
        selectedText: 'unique-code-marker',
      }),
      chatgptAdapter
    );

    expect(result).toBe(true);
    expect(codeScroll).toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});

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

  it('finds a table cell by its preview text', async () => {
    document.body.innerHTML = `
      <div data-autoscroll-container="true">
        <div class="standard-markdown">
          <h3>Here's the breakdown:</h3>
          <table><tbody>
            <tr><td>Part 2 — Skills</td><td>196 lines</td><td>Create 3 parser skills</td></tr>
          </tbody></table>
        </div>
      </div>
    `;
    const cell = [...document.querySelectorAll('td')].find(
      (td) => td.textContent === 'Part 2 — Skills'
    )!;
    const cellScroll = vi.spyOn(cell, 'scrollIntoView');

    const result = await jumpToBookmark(
      makeClaudeBookmark({ preview: 'Part 2 — Skills' }),
      claudeAdapter
    );
    expect(result).toBe(true);
    // Must land on the cell itself, not fall back to scrolling the whole
    // .standard-markdown container (which lands above the table).
    expect(cellScroll).toHaveBeenCalled();
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
