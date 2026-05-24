import { describe, it, expect } from 'vitest';
import { genericAdapter } from '../../src/adapters/generic';

describe('genericAdapter', () => {
  it('matches any URL', () => {
    expect(genericAdapter.matches(new URL('https://example.com'))).toBe(true);
  });

  it('generates conversation ID from hostname + pathname', () => {
    const url = new URL('https://deepseek.com/chat/abc');
    expect(genericAdapter.getConversationId(url)).toBe('deepseek.com/chat/abc');
  });
});
