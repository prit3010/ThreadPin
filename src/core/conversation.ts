import type { Adapter } from './types';

export function getConversationIdForRender(
  adapter: Adapter,
  url: URL
): string {
  return adapter.getStableConversationId?.(url) ?? adapter.getConversationId(url);
}

export function getConversationIdForSave(
  adapter: Adapter,
  url: URL
): string | null {
  if (adapter.id === 'chatgpt') {
    return adapter.getStableConversationId?.(url) ?? null;
  }
  return adapter.getConversationId(url);
}
