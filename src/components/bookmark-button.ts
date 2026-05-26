// src/components/bookmark-button.ts

const BUTTON_ID = 'threadpin-bookmark-btn';

function keepMounted(el: HTMLElement): void {
  const observer = new MutationObserver(() => {
    if (!document.body.contains(el)) {
      document.body.appendChild(el);
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });
}

export interface BookmarkButtonOptions {
  onClick: () => void;
}

export function mountBookmarkButton(
  options: BookmarkButtonOptions
): () => void {
  // Remove any existing button to prevent duplicates on re-init
  document.getElementById(BUTTON_ID)?.remove();

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.className = 'threadpin-bookmark-btn';
  button.textContent = '📌 Bookmark here';
  button.setAttribute('aria-label', 'Bookmark current reading position');

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    options.onClick();
  });

  document.body.appendChild(button);
  keepMounted(button);

  // Returns an unmount function
  return () => button.remove();
}
