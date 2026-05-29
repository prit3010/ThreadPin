import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const contentSource = readFileSync(
  resolve(__dirname, '../../entrypoints/content.ts'),
  'utf8'
);

describe('content script wiring', () => {
  it('uses dock and stable conversation helpers instead of legacy bookmark button wiring', () => {
    expect(contentSource).toContain("from '../src/components/dock'");
    expect(contentSource).toContain('mountDock({');
    expect(contentSource).toContain('getConversationIdForRender');
    expect(contentSource).toContain('getConversationIdForSave');
    expect(contentSource).toContain('handleConversationMaybeChanged');
    expect(contentSource).not.toContain("from '../src/components/bookmark-button'");
    expect(contentSource).not.toContain('getBookmarkHandlePosition');
    expect(contentSource).not.toContain('saveBookmarkHandlePosition');
    expect(contentSource).not.toContain('mountBookmarkButton');
  });
});
