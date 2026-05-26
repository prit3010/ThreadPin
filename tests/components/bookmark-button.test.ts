import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountBookmarkButton } from '../../src/components/bookmark-button';

describe('mountBookmarkButton', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    cleanup = null;
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
  });

  afterEach(() => {
    cleanup?.();
  });

  it('renders the handle at the saved normalized position', () => {
    cleanup = mountBookmarkButton({
      initialPosition: 0.25,
      onClick: vi.fn(),
      onPositionChange: vi.fn(),
    });

    const button = document.getElementById('threadpin-bookmark-btn')!;
    expect(button.style.top).toBe('25%');
  });

  it('reports the handle viewport Y coordinate when clicked', () => {
    const onClick = vi.fn();
    cleanup = mountBookmarkButton({
      initialPosition: 0.75,
      onClick,
      onPositionChange: vi.fn(),
    });

    document.getElementById('threadpin-bookmark-btn')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );

    expect(onClick).toHaveBeenCalledWith({
      viewportY: 600,
      normalizedY: 0.75,
    });
  });

});
