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
