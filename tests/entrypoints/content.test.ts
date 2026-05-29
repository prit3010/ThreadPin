import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const contentSource = readFileSync(
  resolve(__dirname, '../../entrypoints/content.ts'),
  'utf8'
);

function expectSourceToMatch(pattern: RegExp): void {
  expect(contentSource.replace(/\s+/g, ' ')).toMatch(pattern);
}

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

  it('hides return UI while all ThreadPin UI is hidden and restores it by refreshing conversation state', () => {
    expectSourceToMatch(
      /onHideAll:\s*async\s*\(\)\s*=>\s*{.*?returnBtn\.hide\(\);.*?dock\.refresh\(\{\s*hidden:\s*true\s*}\);/
    );
    expectSourceToMatch(
      /if\s*\(\s*uiState\.dockHidden\s*\)\s*{\s*returnBtn\.hide\(\);\s*return;\s*}\s*const active = await getActiveBookmark\(conversationId\);/
    );
    expectSourceToMatch(
      /onRestore:\s*async\s*\(\)\s*=>\s*{.*?dock\.refresh\(\{\s*hidden:\s*false\s*}\);.*?await refreshConversationUi\(\);/
    );
  });

  it('persists the drawer as closed after jumping from a bookmark row', () => {
    expectSourceToMatch(
      /onJump:\s*async\s*\(bookmark\)\s*=>\s*{.*?await jumpToBookmark\(bookmark, adapter\);.*?uiState\s*=\s*\{\s*\.\.\.uiState,\s*drawerMode:\s*'closed'\s*};.*?await saveThreadPinUiState\(\{\s*drawerMode:\s*'closed'\s*}\);/
    );
  });
});
