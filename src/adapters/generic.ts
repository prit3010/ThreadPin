import type { Adapter } from '../core/types';

export const genericAdapter: Adapter = {
  id: 'generic',

  matches(_url: URL): boolean {
    return true; // always matches — used as fallback only
  },

  getConversationId(url: URL): string {
    return `${url.hostname}${url.pathname}`;
  },

  getMessageContainerSelector(): string {
    return 'article, [role="main"] > div, main > div, .message';
  },

  getParagraphSelector(): string {
    return 'p, pre, li';
  },
};
