import type { Adapter } from '../core/types';

function getStableChatGptConversationId(url: URL): string | null {
  const match = url.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
  return match ? `chatgpt:${match[1]}` : null;
}

export const chatgptAdapter: Adapter = {
  id: 'chatgpt',

  matches(url: URL): boolean {
    return (
      url.hostname === 'chatgpt.com' ||
      url.hostname === 'chat.openai.com'
    );
  },

  getConversationId(url: URL): string {
    return getStableChatGptConversationId(url) ?? `chatgpt:${url.pathname}`;
  },

  getStableConversationId(url: URL): string | null {
    return getStableChatGptConversationId(url);
  },

  getMessageContainerSelector(): string {
    return '[data-message-id]';
  },

  getParagraphSelector(): string {
    return '[data-start]';
  },
};
