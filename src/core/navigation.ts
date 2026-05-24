const URL_CHANGE_EVENT = 'threadpin:urlchange';
const PATCHED_KEY = '__threadpin_patched__';

export function initNavigation(): void {
  // Patch pushState — fires on SPA forward navigation
  // Guard against double-patching (e.g. initNavigation called more than once)
  if (!(history.pushState as any)[PATCHED_KEY]) {
    const originalPushState = history.pushState.bind(history);
    history.pushState = function (...args) {
      originalPushState(...args);
      window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    };
    (history.pushState as any)[PATCHED_KEY] = true;
  }

  // Patch replaceState — fires when SPA replaces URL without adding history
  if (!(history.replaceState as any)[PATCHED_KEY]) {
    const originalReplaceState = history.replaceState.bind(history);
    history.replaceState = function (...args) {
      originalReplaceState(...args);
      window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    };
    (history.replaceState as any)[PATCHED_KEY] = true;
  }

  // Handle browser back/forward buttons
  window.addEventListener('popstate', () => {
    window.dispatchEvent(new Event(URL_CHANGE_EVENT));
  });
}

export function onUrlChange(callback: () => void): void {
  window.addEventListener(URL_CHANGE_EVENT, callback);
}
