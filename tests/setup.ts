// tests/setup.ts
import { vi } from 'vitest';

export function createChromeMock() {
  const store: Record<string, unknown> = {};

  return {
    storage: {
      local: {
        get: vi.fn((key: string) =>
          Promise.resolve({ [key]: store[key] })
        ),
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
