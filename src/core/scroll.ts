const SCROLLABLE_OVERFLOW = new Set(['auto', 'scroll', 'overlay']);

export function findNearestScrollContainer(element: Element): HTMLElement | null {
  let current = element.parentElement;

  while (
    current &&
    current !== document.body &&
    current !== document.documentElement
  ) {
    if (isScrollable(current)) return current;
    current = current.parentElement;
  }

  return null;
}

export function findBestScrollContainer(
  messageContainerSelector?: string
): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('*')
  ).filter(isScrollable);

  if (candidates.length === 0) return null;

  const messageCandidates = messageContainerSelector
    ? candidates.filter((candidate) =>
        candidate.querySelector(messageContainerSelector)
      )
    : [];

  return largestVisibleContainer(
    messageCandidates.length > 0 ? messageCandidates : candidates
  );
}

function largestVisibleContainer(candidates: HTMLElement[]): HTMLElement | null {
  return candidates.reduce<HTMLElement | null>((best, candidate) => {
    if (!best) return candidate;
    return visibilityScore(candidate) > visibilityScore(best)
      ? candidate
      : best;
  }, null);
}

function visibilityScore(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const visibleHeight = Math.max(
    0,
    Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top)
  );
  const visibleWidth = Math.max(0, rect.width || element.clientWidth);
  const visibleArea = visibleHeight * visibleWidth;
  const scrollRange = Math.max(0, element.scrollHeight - element.clientHeight);

  return visibleArea + scrollRange;
}

function isScrollable(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    SCROLLABLE_OVERFLOW.has(style.overflowY) &&
    element.scrollHeight > element.clientHeight
  );
}
