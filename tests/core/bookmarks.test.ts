import { describe, it, expect, beforeEach, vi } from 'vitest';
import { captureAnchor, createBookmark } from '../../src/core/bookmarks';
import { chatgptAdapter } from '../../src/adapters/chatgpt';
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
