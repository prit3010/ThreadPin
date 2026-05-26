import { describe, it, expect, beforeEach, vi } from 'vitest';
import { jumpToBookmark } from '../../src/core/matching';
import { chatgptAdapter } from '../../src/adapters/chatgpt';
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
});
