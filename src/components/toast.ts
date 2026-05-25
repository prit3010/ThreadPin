// src/components/toast.ts

const TOAST_ID = 'threadpin-toast';
const DURATION_MS = 2500;

export function showToast(message: string): void {
  // Remove any existing toast immediately
  document.getElementById(TOAST_ID)?.remove();

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.className = 'threadpin-toast';
  toast.textContent = message;

  document.body.appendChild(toast);

  // Trigger entrance transition on the next paint
  requestAnimationFrame(() => {
    toast.classList.add('threadpin-toast--visible');
  });

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.remove('threadpin-toast--visible');
    toast.addEventListener(
      'transitionend',
      () => toast.remove(),
      { once: true }
    );
  }, DURATION_MS);
}
