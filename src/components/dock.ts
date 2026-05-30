const DOCK_ID = 'threadpin-dock';
const RESTORE_ID = 'threadpin-restore-tab';
const GUIDE_ID = 'threadpin-capture-line';
const LEGACY_BOOKMARK_BUTTON_ID = 'threadpin-bookmark-btn';

let nextInstanceId = 0;
let activeInstanceId = 0;
let activeKeepMountedCleanup: (() => void) | null = null;
let activeKeepMountedOwnerId = 0;
let activeDragCleanup: (() => void) | null = null;

function keepMounted(el: HTMLElement): () => void {
  const observer = new MutationObserver(() => {
    if (typeof document === 'undefined') return;
    if (!document.body.contains(el)) {
      document.body.appendChild(el);
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });
  return () => observer.disconnect();
}

function stopKeepingMounted(ownerId?: number): void {
  if (ownerId !== undefined && activeKeepMountedOwnerId !== ownerId) return;
  activeKeepMountedCleanup?.();
  activeKeepMountedCleanup = null;
  activeKeepMountedOwnerId = 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export interface DockOptions {
  bookmarkCount: number;
  hidden: boolean;
  positionFraction?: number;
  returnVisible?: boolean;
  onSave: () => void;
  onToggleList: () => void;
  onHideAll: () => void;
  onRestore: () => void;
  onReturn?: () => void;
  onPositionChange?: (fraction: number) => void;
}

export interface DockRefresh {
  bookmarkCount?: number;
  hidden?: boolean;
  returnVisible?: boolean;
}

export interface DockAPI {
  refresh(update: DockRefresh): void;
  getAnchorRect(): DOMRect | null;
  unmount(): void;
}

export function mountDock(options: DockOptions): DockAPI {
  stopKeepingMounted();
  activeDragCleanup?.();
  activeDragCleanup = null;
  document.getElementById(DOCK_ID)?.remove();
  document.getElementById(RESTORE_ID)?.remove();
  document.getElementById(LEGACY_BOOKMARK_BUTTON_ID)?.remove();

  const instanceId = ++nextInstanceId;
  activeInstanceId = instanceId;
  let disposed = false;
  let bookmarkCount = options.bookmarkCount;
  let hidden = options.hidden;
  let returnVisible = options.returnVisible ?? false;
  let positionFraction = clamp01(options.positionFraction ?? 0.5);

  let dock: HTMLDivElement | null = null;
  let restore: HTMLButtonElement | null = null;
  let pinEl: HTMLButtonElement | null = null;
  let guideEl: HTMLDivElement | null = null;

  let dragging = false;
  let grabOffsetY = 0;
  let guideHideTimer: ReturnType<typeof setTimeout> | null = null;

  function isCurrent(): boolean {
    return !disposed && activeInstanceId === instanceId;
  }

  function trackMountedElement(el: HTMLElement): void {
    activeKeepMountedCleanup = keepMounted(el);
    activeKeepMountedOwnerId = instanceId;
  }

  function viewportHeight(): number {
    return typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 0;
  }

  function applyPosition(): void {
    if (!dock || !isCurrent()) return;
    const height = viewportHeight();
    const target = positionFraction * height;
    // pinEl's offsetParent is the position:relative .threadpin-dock__pin-wrap
    // (which exists so the return icon can anchor to it), so pinEl.offsetTop is
    // NOT relative to the dock. Measure the PIN center relative to the dock via
    // getBoundingClientRect so the PIN lands exactly on the capture line.
    let pinOffset = 0;
    if (pinEl) {
      const pinRect = pinEl.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      pinOffset = pinRect.top - dockRect.top + pinRect.height / 2;
    }
    const dockHeight = dock.offsetHeight || 0;
    let top = target - pinOffset;
    const maxTop = Math.max(0, height - dockHeight);
    top = Math.max(0, Math.min(top, maxTop));
    dock.style.top = `${Math.round(top)}px`;
    dock.style.bottom = 'auto';
    dock.style.transform = 'none';
  }

  function ensureGuide(): void {
    if (guideEl) return;
    guideEl = document.createElement('div');
    guideEl.id = GUIDE_ID;
    guideEl.className = 'threadpin-capture-line';
    document.body.appendChild(guideEl);
  }

  function showGuide(y: number): void {
    ensureGuide();
    if (!guideEl) return;
    if (guideHideTimer) {
      clearTimeout(guideHideTimer);
      guideHideTimer = null;
    }
    guideEl.style.top = `${Math.round(y)}px`;
    guideEl.classList.add('threadpin-capture-line--visible');
  }

  function hideGuideSoon(): void {
    if (!guideEl) return;
    guideHideTimer = setTimeout(() => {
      guideEl?.classList.remove('threadpin-capture-line--visible');
    }, 600);
  }

  function onWindowMouseMove(event: MouseEvent): void {
    if (!isCurrent() || !dragging) return;
    const height = viewportHeight();
    const pinCenter = Math.max(0, Math.min(event.clientY - grabOffsetY, height));
    positionFraction = clamp01(height > 0 ? pinCenter / height : 0.5);
    applyPosition();
    showGuide(pinCenter);
  }

  function onWindowMouseUp(): void {
    if (!isCurrent() || !dragging) return;
    dragging = false;
    dock?.classList.remove('threadpin-dock--dragging');
    hideGuideSoon();
    options.onPositionChange?.(positionFraction);
  }

  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);
  activeDragCleanup = () => {
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
  };

  function render(): void {
    if (!isCurrent()) return;

    stopKeepingMounted(instanceId);
    dock?.remove();
    restore?.remove();
    dock = null;
    restore = null;
    pinEl = null;

    if (hidden) {
      restore = document.createElement('button');
      restore.id = RESTORE_ID;
      restore.className = 'threadpin-restore-tab';
      restore.type = 'button';
      restore.textContent = '›';
      restore.setAttribute('aria-label', 'Restore ThreadPin');
      restore.addEventListener('click', options.onRestore);
      document.body.appendChild(restore);
      trackMountedElement(restore);
      return;
    }

    dock = document.createElement('div');
    dock.id = DOCK_ID;
    dock.className = 'threadpin-dock';

    const grip = document.createElement('div');
    grip.className = 'threadpin-dock__grip';
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-label', 'Drag ThreadPin up or down');
    grip.addEventListener('mousedown', (event) => {
      if (!isCurrent()) return;
      event.preventDefault();
      dragging = true;
      grabOffsetY = event.clientY - positionFraction * viewportHeight();
      dock?.classList.add('threadpin-dock--dragging');
      showGuide(positionFraction * viewportHeight());
    });

    const list = document.createElement('button');
    list.type = 'button';
    list.className = 'threadpin-dock__list';
    list.textContent = `LIST ${bookmarkCount}`;
    list.setAttribute('aria-label', 'Toggle bookmarks drawer');
    list.addEventListener('click', options.onToggleList);

    const pinWrap = document.createElement('div');
    pinWrap.className = 'threadpin-dock__pin-wrap';

    const ret = document.createElement('button');
    ret.type = 'button';
    ret.className = 'threadpin-dock__return';
    ret.textContent = '↩';
    ret.title = 'Return to bookmark';
    ret.setAttribute('aria-label', 'Return to bookmark');
    if (!returnVisible) ret.style.display = 'none';
    ret.addEventListener('click', () => options.onReturn?.());

    pinEl = document.createElement('button');
    pinEl.type = 'button';
    pinEl.className = 'threadpin-dock__save';
    pinEl.textContent = 'PIN';
    pinEl.setAttribute('aria-label', 'Bookmark current reading position');
    pinEl.addEventListener('click', options.onSave);

    pinWrap.appendChild(ret);
    pinWrap.appendChild(pinEl);

    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'threadpin-dock__hide';
    hide.textContent = '×';
    hide.setAttribute('aria-label', 'Hide ThreadPin');
    hide.addEventListener('click', options.onHideAll);

    dock.appendChild(grip);
    dock.appendChild(list);
    dock.appendChild(pinWrap);
    dock.appendChild(hide);
    document.body.appendChild(dock);
    trackMountedElement(dock);
    applyPosition();
  }

  render();

  return {
    refresh(update) {
      if (!isCurrent()) return;
      bookmarkCount = update.bookmarkCount ?? bookmarkCount;
      hidden = update.hidden ?? hidden;
      returnVisible = update.returnVisible ?? returnVisible;
      render();
    },
    getAnchorRect() {
      return dock ? dock.getBoundingClientRect() : null;
    },
    unmount() {
      if (disposed) return;
      disposed = true;
      if (activeInstanceId !== instanceId) return;

      activeInstanceId = 0;
      stopKeepingMounted(instanceId);
      activeDragCleanup?.();
      activeDragCleanup = null;
      if (guideHideTimer) clearTimeout(guideHideTimer);
      guideEl?.remove();
      guideEl = null;
      dock?.remove();
      restore?.remove();
      dock = null;
      restore = null;
      pinEl = null;
    },
  };
}
