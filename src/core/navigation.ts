const URL_CHANGE_EVENT = 'threadpin:urlchange';
const PATCHED_KEY = '__threadpin_patched__';
const POLL_KEY = '__threadpin_url_poll__';

export interface NavigationOptions {
  pollIntervalMs?: number;
}

export function initNavigation(options: NavigationOptions = {}): void {
  const pollIntervalMs = options.pollIntervalMs ?? 500;

  // Patch pushState — fires on SPA forward navigation
  // Guard against double-patching (e.g. initNavigation called more than once)
  if (!(history.pushState as any)[PATCHED_KEY]) {
    const originalPushState = history.pushState.bind(history);
    history.pushState = function (...args) {
      originalPushState(...args);
      (window as any).__threadpin_last_url__ = window.location.href;
      window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    };
    (history.pushState as any)[PATCHED_KEY] = true;
  }

  // Patch replaceState — fires when SPA replaces URL without adding history
  if (!(history.replaceState as any)[PATCHED_KEY]) {
    const originalReplaceState = history.replaceState.bind(history);
    history.replaceState = function (...args) {
      originalReplaceState(...args);
      (window as any).__threadpin_last_url__ = window.location.href;
      window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    };
    (history.replaceState as any)[PATCHED_KEY] = true;
  }

  // Handle browser back/forward buttons
  window.addEventListener('popstate', () => {
    (window as any).__threadpin_last_url__ = window.location.href;
    window.dispatchEvent(new Event(URL_CHANGE_EVENT));
  });

  const windowWithPoll = window as typeof window & {
    [POLL_KEY]?: number;
    __threadpin_last_url__?: string;
  };

  if (!windowWithPoll[POLL_KEY]) {
    windowWithPoll.__threadpin_last_url__ = window.location.href;
    windowWithPoll[POLL_KEY] = window.setInterval(() => {
      if (window.location.href === windowWithPoll.__threadpin_last_url__) return;
      windowWithPoll.__threadpin_last_url__ = window.location.href;
      window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    }, pollIntervalMs);
  }
}

export function onUrlChange(callback: () => void): void {
  window.addEventListener(URL_CHANGE_EVENT, callback);
}
