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

  it('falls back to pathname when no /c/{id} segment present', () => {
    const url = new URL('https://chatgpt.com/');
    expect(chatgptAdapter.getConversationId(url)).toBe('chatgpt:/');
  });

  it('returns [data-message-id] as message container selector', () => {
    expect(chatgptAdapter.getMessageContainerSelector()).toBe('[data-message-id]');
  });

  it('returns [data-start] as paragraph selector', () => {
    expect(chatgptAdapter.getParagraphSelector()).toBe('[data-start]');
  });
});
