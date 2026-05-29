import { describe, it, expect } from 'vitest';
import {
  getConversationIdForRender,
  getConversationIdForSave,
} from '../../src/core/conversation';
import { chatgptAdapter } from '../../src/adapters/chatgpt';
import { genericAdapter } from '../../src/adapters/generic';

describe('conversation scope helpers', () => {
  it('uses stable chatgpt ids for render and save on /c/id urls', () => {
    const url = new URL('https://chatgpt.com/c/chat-a');

    expect(getConversationIdForRender(chatgptAdapter, url)).toBe('chatgpt:chat-a');
    expect(getConversationIdForSave(chatgptAdapter, url)).toBe('chatgpt:chat-a');
  });

  it('allows rendering but blocks saving for unstable chatgpt urls', () => {
    const url = new URL('https://chatgpt.com/');

    expect(getConversationIdForRender(chatgptAdapter, url)).toBe('chatgpt:/');
    expect(getConversationIdForSave(chatgptAdapter, url)).toBeNull();
  });

  it('keeps generic adapter fallback behavior for render and save', () => {
    const url = new URL('https://example.com/thread/1');

    expect(getConversationIdForRender(genericAdapter, url)).toBe('example.com/thread/1');
    expect(getConversationIdForSave(genericAdapter, url)).toBe('example.com/thread/1');
  });
});
