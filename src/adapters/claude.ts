import type { Adapter } from '../core/types';

function getStableClaudeConversationId(url: URL): string | null {
  const match = url.pathname.match(/^\/chat\/([a-zA-Z0-9-]+)/);
  return match ? `claude:${match[1]}` : null;
}

export const claudeAdapter: Adapter = {
  id: 'claude',

  matches(url: URL): boolean {
    return url.hostname === 'claude.ai';
  },

  getConversationId(url: URL): string {
    return getStableClaudeConversationId(url) ?? `claude:${url.pathname}`;
  },

  getStableConversationId(url: URL): string | null {
    return getStableClaudeConversationId(url);
  },

  getMessageContainerSelector(): string {
    return '[data-testid="user-message"], .standard-markdown';
  },

  getParagraphSelector(): string {
    return 'p, li, h1, h2, h3, pre';
  },

  getTextBlockSelector(): string {
    return 'p, li, h1, h2, h3, pre code > span';
  },

  getScrollContainer(): Element | null {
    return document.querySelector('[data-autoscroll-container]');
  },
};
