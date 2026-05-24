import type { Adapter } from '../core/types';

export const chatgptAdapter: Adapter = {
  id: 'chatgpt',

  matches(url: URL): boolean {
    return (
      url.hostname === 'chatgpt.com' ||
      url.hostname === 'chat.openai.com'
    );
  },

  getConversationId(url: URL): string {
    const match = url.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
    return `chatgpt:${match ? match[1] : url.pathname}`;
  },

  getMessageContainerSelector(): string {
    return '[data-message-id]';
  },

  getParagraphSelector(): string {
    return '[data-start]';
  },
};
