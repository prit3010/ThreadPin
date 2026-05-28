const DOCK_ID = 'threadpin-dock';
const RESTORE_ID = 'threadpin-restore-tab';

let nextInstanceId = 0;
let activeInstanceId = 0;
let activeKeepMountedCleanup: (() => void) | null = null;
let activeKeepMountedOwnerId = 0;

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

export interface DockOptions {
  bookmarkCount: number;
  hidden: boolean;
  onSave: () => void;
  onToggleList: () => void;
  onHideAll: () => void;
  onRestore: () => void;
}

export interface DockAPI {
  refresh(update: { bookmarkCount?: number; hidden?: boolean }): void;
  unmount(): void;
}

export function mountDock(options: DockOptions): DockAPI {
  stopKeepingMounted();
  document.getElementById(DOCK_ID)?.remove();
  document.getElementById(RESTORE_ID)?.remove();

  const instanceId = ++nextInstanceId;
  activeInstanceId = instanceId;
  let disposed = false;
  let bookmarkCount = options.bookmarkCount;
  let hidden = options.hidden;
  let dock: HTMLDivElement | null = null;
  let restore: HTMLButtonElement | null = null;

  function isCurrent(): boolean {
    return !disposed && activeInstanceId === instanceId;
  }

  function trackMountedElement(el: HTMLElement): void {
    activeKeepMountedCleanup = keepMounted(el);
    activeKeepMountedOwnerId = instanceId;
  }

  function render(): void {
    if (!isCurrent()) return;

    stopKeepingMounted(instanceId);
    dock?.remove();
    restore?.remove();
    dock = null;
    restore = null;

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

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'threadpin-dock__save';
    save.textContent = 'PIN';
    save.setAttribute('aria-label', 'Bookmark current reading position');
    save.addEventListener('click', options.onSave);

    const list = document.createElement('button');
    list.type = 'button';
    list.className = 'threadpin-dock__list';
    list.textContent = `LIST ${bookmarkCount}`;
    list.setAttribute('aria-label', 'Toggle bookmarks drawer');
    list.addEventListener('click', options.onToggleList);

    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'threadpin-dock__hide';
    hide.textContent = '×';
    hide.setAttribute('aria-label', 'Hide ThreadPin');
    hide.addEventListener('click', options.onHideAll);

    dock.appendChild(save);
    dock.appendChild(list);
    dock.appendChild(hide);
    document.body.appendChild(dock);
    trackMountedElement(dock);
  }

  render();

  return {
    refresh(update) {
      if (!isCurrent()) return;
      bookmarkCount = update.bookmarkCount ?? bookmarkCount;
      hidden = update.hidden ?? hidden;
      render();
    },
    unmount() {
      if (disposed) return;
      disposed = true;
      if (activeInstanceId !== instanceId) return;

      activeInstanceId = 0;
      stopKeepingMounted(instanceId);
      dock?.remove();
      restore?.remove();
      dock = null;
      restore = null;
    },
  };
}
