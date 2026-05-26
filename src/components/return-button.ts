// src/components/return-button.ts
import type { Bookmark } from '../core/types';

function keepMounted(el: HTMLElement): void {
  const observer = new MutationObserver(() => {
    if (!document.body.contains(el)) {
      document.body.appendChild(el);
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });
}

const BUTTON_ID = 'threadpin-return-btn';

export interface ReturnButtonOptions {
  onReturn: (bookmark: Bookmark) => void;
}

export interface ReturnButtonAPI {
  show(bookmark: Bookmark): void;
  hide(): void;
  update(bookmark: Bookmark): void;
}

export function mountReturnButton(
  options: ReturnButtonOptions
): ReturnButtonAPI {
  document.getElementById(BUTTON_ID)?.remove();

  let currentBookmark: Bookmark | null = null;

  const wrapper = document.createElement('div');
  wrapper.id = BUTTON_ID;
  wrapper.className = 'threadpin-return-btn threadpin-return-btn--hidden';

  const label = document.createElement('span');
  label.className = 'threadpin-return-btn__label';
  label.textContent = '↩ Return to bookmark';

  const dismiss = document.createElement('button');
  dismiss.className = 'threadpin-return-btn__dismiss';
  dismiss.textContent = '×';
  dismiss.setAttribute('aria-label', 'Dismiss return button');

  wrapper.appendChild(label);
  wrapper.appendChild(dismiss);
  document.body.appendChild(wrapper);
  keepMounted(wrapper);

  label.addEventListener('click', () => {
    if (currentBookmark) options.onReturn(currentBookmark);
  });

  dismiss.addEventListener('click', (e) => {
    e.stopPropagation();
    api.hide();
  });

  const api: ReturnButtonAPI = {
    show(bookmark: Bookmark) {
      currentBookmark = bookmark;
      wrapper.classList.remove('threadpin-return-btn--hidden');
    },
    hide() {
      currentBookmark = null;
      wrapper.classList.add('threadpin-return-btn--hidden');
    },
    update(bookmark: Bookmark) {
      currentBookmark = bookmark;
    },
  };

  return api;
}
