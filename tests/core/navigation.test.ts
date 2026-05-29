import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initNavigation, onUrlChange } from '../../src/core/navigation';

describe('navigation', () => {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    const windowWithPoll = window as typeof window & {
      __threadpin_url_poll__?: number;
      __threadpin_last_url__?: string;
    };

    if (windowWithPoll.__threadpin_url_poll__ !== undefined) {
      window.clearInterval(windowWithPoll.__threadpin_url_poll__);
      delete windowWithPoll.__threadpin_url_poll__;
    }
    delete windowWithPoll.__threadpin_last_url__;
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    delete (history.pushState as any).__threadpin_patched__;
    delete (history.replaceState as any).__threadpin_patched__;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.useRealTimers();
  });

  it('calls listener when threadpin:urlchange event fires', () => {
    const listener = vi.fn();
    onUrlChange(listener);
    window.dispatchEvent(new Event('threadpin:urlchange'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('patches history.pushState to emit threadpin:urlchange', () => {
    initNavigation();

    const listener = vi.fn();
    window.addEventListener('threadpin:urlchange', listener);
    history.pushState({}, '', '/c/new-conversation');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('patches history.replaceState to emit threadpin:urlchange', () => {
    initNavigation();

    const listener = vi.fn();
    window.addEventListener('threadpin:urlchange', listener);
    history.replaceState({}, '', '/c/same-url');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('polls for location changes that do not emit history events', () => {
    vi.useFakeTimers();

    try {
      initNavigation({ pollIntervalMs: 50 });

      const listener = vi.fn();
      window.addEventListener('threadpin:urlchange', listener);

      history.replaceState({}, '', '/c/first');
      listener.mockClear();

      Object.defineProperty(window, 'location', {
        configurable: true,
        value: new URL('https://chatgpt.com/c/second'),
      });

      vi.advanceTimersByTime(60);

      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
      vi.useRealTimers();
    }
  });
});
