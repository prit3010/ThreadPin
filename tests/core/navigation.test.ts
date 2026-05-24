import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initNavigation, onUrlChange } from '../../src/core/navigation';

describe('navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls listener when threadpin:urlchange event fires', () => {
    const listener = vi.fn();
    onUrlChange(listener);
    window.dispatchEvent(new Event('threadpin:urlchange'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('patches history.pushState to emit threadpin:urlchange', () => {
    const original = history.pushState.bind(history);
    initNavigation();

    const listener = vi.fn();
    window.addEventListener('threadpin:urlchange', listener);
    history.pushState({}, '', '/c/new-conversation');

    expect(listener).toHaveBeenCalledTimes(1);
    history.pushState = original;
  });

  it('patches history.replaceState to emit threadpin:urlchange', () => {
    const original = history.replaceState.bind(history);
    initNavigation();

    const listener = vi.fn();
    window.addEventListener('threadpin:urlchange', listener);
    history.replaceState({}, '', '/c/same-url');

    expect(listener).toHaveBeenCalledTimes(1);
    history.replaceState = original;
  });
});
