import { describe, it, expect, beforeEach } from 'vitest';
import { claudeAdapter } from '../../src/adapters/claude';

describe('claudeAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

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

  it('returns the paragraph selector', () => {
    expect(claudeAdapter.getParagraphSelector()).toBe('p, li, h1, h2, h3, pre');
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
    expect(el).toBe(document.querySelector('[data-autoscroll-container]'));
  });

  it('returns null when no autoscroll container is present', () => {
    document.body.innerHTML = '<div><p>hi</p></div>';
    expect(claudeAdapter.getScrollContainer?.()).toBeNull();
  });
});
