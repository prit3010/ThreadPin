import type { Adapter } from '../core/types';
import { chatgptAdapter } from './chatgpt';
import { genericAdapter } from './generic';

const ADAPTERS: Adapter[] = [chatgptAdapter];

export function getAdapter(url: URL): Adapter {
  return ADAPTERS.find(a => a.matches(url)) ?? genericAdapter;
}
