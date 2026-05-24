// tests/setup.ts
import { vi } from 'vitest';

export function createChromeMock() {
  const store: Record<string, unknown> = {};

  return {
    storage: {
      local: {
        get: vi.fn((keys: string | string[]) => {
          if (Array.isArray(keys)) {
            return Promise.resolve(
              Object.fromEntries(keys.map((k: string) => [k, store[k]]))
            );
          }
          return Promise.resolve({ [keys]: store[keys] });
        }),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(store, items);
          return Promise.resolve();
        }),
        remove: vi.fn((key: string) => {
          delete store[key];
          return Promise.resolve();
        }),
      },
    },
  } as unknown as typeof chrome;
}
