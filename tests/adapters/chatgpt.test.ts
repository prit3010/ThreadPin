import { describe, it, expect } from 'vitest';
import { chatgptAdapter } from '../../src/adapters/chatgpt';

describe('chatgptAdapter', () => {
  it('matches chatgpt.com', () => {
    expect(
      chatgptAdapter.matches(new URL('https://chatgpt.com/c/abc-123'))
    ).toBe(true);
  });

  it('matches chat.openai.com', () => {
    expect(
      chatgptAdapter.matches(new URL('https://chat.openai.com/c/abc-123'))
    ).toBe(true);
  });

  it('does not match other domains', () => {
    expect(
      chatgptAdapter.matches(new URL('https://claude.ai/chat/abc'))
    ).toBe(false);
  });

  it('extracts conversation ID from /c/{id} path', () => {
    const url = new URL('https://chatgpt.com/c/abc-def-123');
    expect(chatgptAdapter.getConversationId(url)).toBe('chatgpt:abc-def-123');
  });

  it('extracts conversation ID when called without adapter receiver', () => {
    const { getConversationId } = chatgptAdapter;
    expect(getConversationId(new URL('https://chatgpt.com/c/abc-123'))).toBe('chatgpt:abc-123');
  });

  it('falls back to pathname when no /c/{id} segment present', () => {
    const url = new URL('https://chatgpt.com/');
    expect(chatgptAdapter.getConversationId(url)).toBe('chatgpt:/');
  });

  it('marks chatgpt root and new-chat paths as unstable', () => {
    expect(chatgptAdapter.getStableConversationId?.(new URL('https://chatgpt.com/'))).toBeNull();
    expect(chatgptAdapter.getStableConversationId?.(new URL('https://chatgpt.com/?model=gpt-5'))).toBeNull();
  });

  it('returns stable chatgpt conversation id for /c/id urls', () => {
    expect(chatgptAdapter.getStableConversationId?.(new URL('https://chatgpt.com/c/abc-123'))).toBe('chatgpt:abc-123');
  });

  it('returns assistant and user turn message container selectors', () => {
    expect(chatgptAdapter.getMessageContainerSelector()).toBe(
      '[data-message-id], [data-testid^="conversation-turn-"]'
    );
  });

  it('returns [data-start] as paragraph selector', () => {
    expect(chatgptAdapter.getParagraphSelector()).toBe('[data-start]');
  });
});
