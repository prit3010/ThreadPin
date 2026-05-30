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
  it('uses dock + stable conversation helpers and drops the legacy return button', () => {
    expect(contentSource).toContain("from '../src/components/dock'");
    expect(contentSource).toContain('mountDock({');
    expect(contentSource).toContain('getConversationIdForRender');
    expect(contentSource).toContain('getConversationIdForSave');
    expect(contentSource).toContain('handleConversationMaybeChanged');
    expect(contentSource).not.toContain("from '../src/components/return-button'");
    expect(contentSource).not.toContain('mountReturnButton');
    expect(contentSource).not.toContain("from '../src/components/bookmark-button'");
    expect(contentSource).not.toContain('mountBookmarkButton');
  });

  it('captures at the draggable PIN line using the stored handle fraction', () => {
    expect(contentSource).toContain('getBookmarkHandlePosition');
    expect(contentSource).toContain('saveBookmarkHandlePosition');
    expectSourceToMatch(/const viewportY = Math\.round\(dockFraction \* window\.innerHeight\);/);
    expectSourceToMatch(/captureAnchor\(adapter, viewportY\)/);
  });

  it('drives the return icon from the dock based on the active bookmark', () => {
    expectSourceToMatch(
      /onReturn:\s*async\s*\(\)\s*=>\s*{[^}]*if\s*\(!activeBookmark\)\s*return;\s*await jumpAndToast\(activeBookmark\);/
    );
    expectSourceToMatch(
      /async function jumpAndToast\(bookmark: Bookmark\): Promise<void> {[\s\S]*?jumpToBookmark\(bookmark, adapter\)/
    );
    expectSourceToMatch(/returnVisible:\s*activeBookmark !== null/);
  });

  it('opens the list panel anchored beside the dock', () => {
    expect(contentSource).toContain('openDrawerBesideDock');
    expectSourceToMatch(/const rect = dock\.getAnchorRect\(\);/);
  });

  it('persists the drawer as closed after jumping from a bookmark row', () => {
    expectSourceToMatch(
      /onJump:\s*async\s*\(bookmark\)\s*=>\s*{.*?await jumpAndToast\(bookmark\);.*?uiState\s*=\s*\{\s*\.\.\.uiState,\s*drawerMode:\s*'closed'\s*};.*?await saveThreadPinUiState\(\{\s*drawerMode:\s*'closed'\s*}\);/
    );
  });
});
