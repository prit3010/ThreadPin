// src/components/bookmark-button.ts

const BUTTON_ID = 'threadpin-bookmark-btn';

function keepMounted(el: HTMLElement): void {
  const observer = new MutationObserver(() => {
    if (typeof document === 'undefined') return;
    if (!document.body.contains(el)) {
      document.body.appendChild(el);
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });
}

export interface BookmarkHandlePosition {
  viewportY: number;
  normalizedY: number;
}

export interface BookmarkButtonOptions {
  initialPosition?: number;
  onClick: (position: BookmarkHandlePosition) => void;
  onPositionChange?: (normalizedY: number) => void;
}

export function mountBookmarkButton(
  options: BookmarkButtonOptions
): () => void {
  // Remove any existing button to prevent duplicates on re-init
  document.getElementById(BUTTON_ID)?.remove();

  let normalizedY = clampNormalized(options.initialPosition ?? 0.5);
  let isDragging = false;
  let movedDuringPointer = false;
  let suppressNextClick = false;
  let suppressClickTimer: number | null = null;
  let pointerStartY = 0;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.className = 'threadpin-bookmark-btn';
  button.textContent = '📌';
  button.title = 'Drag to choose bookmark position. Click to bookmark here.';
  button.setAttribute('aria-label', 'Bookmark current reading position');
  applyPosition();

  button.addEventListener('pointerdown', (e) => {
    isDragging = true;
    movedDuringPointer = false;
    pointerStartY = e.clientY;
    button.classList.add('threadpin-bookmark-btn--dragging');
    button.setPointerCapture?.(e.pointerId);
  });

  button.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    if (Math.abs(e.clientY - pointerStartY) > 4) {
      movedDuringPointer = true;
    }
    setFromViewportY(e.clientY);
  });

  button.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    button.classList.remove('threadpin-bookmark-btn--dragging');
    button.releasePointerCapture?.(e.pointerId);
    if (movedDuringPointer) {
      suppressSyntheticClick();
      options.onPositionChange?.(normalizedY);
    }
  });

  button.addEventListener('mousedown', (e) => {
    isDragging = true;
    movedDuringPointer = false;
    pointerStartY = e.clientY;
    button.classList.add('threadpin-bookmark-btn--dragging');
  });

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    if (Math.abs(e.clientY - pointerStartY) > 4) {
      movedDuringPointer = true;
    }
    setFromViewportY(e.clientY);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    button.classList.remove('threadpin-bookmark-btn--dragging');
    if (movedDuringPointer) {
      suppressSyntheticClick();
      options.onPositionChange?.(normalizedY);
    }
  };

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (suppressNextClick || movedDuringPointer) {
      if (movedDuringPointer && !suppressNextClick) {
        options.onPositionChange?.(normalizedY);
      }
      suppressNextClick = false;
      movedDuringPointer = false;
      return;
    }
    options.onClick({
      viewportY: Math.round(normalizedY * window.innerHeight),
      normalizedY,
    });
  });

  document.body.appendChild(button);
  keepMounted(button);

  // Returns an unmount function
  return () => {
    if (suppressClickTimer !== null) {
      window.clearTimeout(suppressClickTimer);
    }
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    button.remove();
  };

  function setFromViewportY(viewportY: number): void {
    normalizedY = clampNormalized(viewportY / window.innerHeight);
    applyPosition();
  }

  function applyPosition(): void {
    button.style.top = `${normalizedY * 100}%`;
  }

  function suppressSyntheticClick(): void {
    suppressNextClick = true;
    if (suppressClickTimer !== null) {
      window.clearTimeout(suppressClickTimer);
    }
    suppressClickTimer = window.setTimeout(() => {
      suppressNextClick = false;
      suppressClickTimer = null;
    }, 250);
  }
}

function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
