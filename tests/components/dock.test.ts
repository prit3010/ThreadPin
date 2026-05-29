import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountDock } from '../../src/components/dock';

describe('mountDock', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders visually distinct save, list, and hide controls', () => {
    mountDock({
      bookmarkCount: 3,
      hidden: false,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    expect(document.querySelector('.threadpin-dock')).not.toBeNull();
    expect(document.querySelector('.threadpin-dock__save')?.textContent).toContain('PIN');
    expect(document.querySelector('.threadpin-dock__list')?.textContent).toContain('3');
    expect(document.querySelector('.threadpin-dock__hide')?.getAttribute('aria-label')).toBe('Hide ThreadPin');
  });

  it('removes a stale legacy bookmark button when mounting', () => {
    const legacyButton = document.createElement('button');
    legacyButton.id = 'threadpin-bookmark-btn';
    document.body.appendChild(legacyButton);

    mountDock({
      bookmarkCount: 0,
      hidden: false,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    expect(document.getElementById('threadpin-bookmark-btn')).toBeNull();
  });

  it('calls the correct action callbacks', () => {
    const onSave = vi.fn();
    const onToggleList = vi.fn();
    const onHideAll = vi.fn();

    mountDock({
      bookmarkCount: 1,
      hidden: false,
      onSave,
      onToggleList,
      onHideAll,
      onRestore: vi.fn(),
    });

    document.querySelector<HTMLButtonElement>('.threadpin-dock__save')!.click();
    document.querySelector<HTMLButtonElement>('.threadpin-dock__list')!.click();
    document.querySelector<HTMLButtonElement>('.threadpin-dock__hide')!.click();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onToggleList).toHaveBeenCalledTimes(1);
    expect(onHideAll).toHaveBeenCalledTimes(1);
  });

  it('shows only the restore tab when hidden', () => {
    const onRestore = vi.fn();

    mountDock({
      bookmarkCount: 0,
      hidden: true,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore,
    });

    expect(document.querySelector('.threadpin-dock')).toBeNull();
    const restore = document.querySelector<HTMLButtonElement>('.threadpin-restore-tab')!;
    expect(restore).not.toBeNull();

    restore.click();
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('refresh updates count and hidden state', () => {
    const dock = mountDock({
      bookmarkCount: 0,
      hidden: false,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    dock.refresh({ bookmarkCount: 5 });

    expect(document.querySelector('.threadpin-dock')).not.toBeNull();
    expect(document.querySelector('.threadpin-dock__list')?.textContent).toContain('5');

    dock.refresh({ hidden: true });

    expect(document.querySelector('.threadpin-dock')).toBeNull();
    expect(document.querySelector('.threadpin-restore-tab')).not.toBeNull();
  });

  it('unmount removes dock and restore tab', () => {
    const visibleDock = mountDock({
      bookmarkCount: 1,
      hidden: false,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    visibleDock.unmount();

    expect(document.querySelector('.threadpin-dock')).toBeNull();
    expect(document.querySelector('.threadpin-restore-tab')).toBeNull();

    const hiddenDock = mountDock({
      bookmarkCount: 1,
      hidden: true,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    hiddenDock.unmount();

    expect(document.querySelector('.threadpin-dock')).toBeNull();
    expect(document.querySelector('.threadpin-restore-tab')).toBeNull();
  });

  it('refresh after unmount does not re-add dock UI', () => {
    const dock = mountDock({
      bookmarkCount: 1,
      hidden: false,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    dock.unmount();
    dock.refresh({ bookmarkCount: 5, hidden: false });

    expect(document.querySelector('.threadpin-dock')).toBeNull();
    expect(document.querySelector('.threadpin-restore-tab')).toBeNull();
  });

  it('ignores older API calls after a newer mount exists', async () => {
    const firstDock = mountDock({
      bookmarkCount: 1,
      hidden: false,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });
    const secondDock = mountDock({
      bookmarkCount: 2,
      hidden: false,
      onSave: vi.fn(),
      onToggleList: vi.fn(),
      onHideAll: vi.fn(),
      onRestore: vi.fn(),
    });

    firstDock.refresh({ bookmarkCount: 9, hidden: true });

    expect(document.querySelector('.threadpin-restore-tab')).toBeNull();
    expect(document.querySelector('.threadpin-dock')).not.toBeNull();
    expect(document.querySelector('.threadpin-dock__list')?.textContent).toContain('2');

    firstDock.unmount();

    expect(document.querySelector('.threadpin-restore-tab')).toBeNull();
    expect(document.querySelector('.threadpin-dock')).not.toBeNull();
    expect(document.querySelector('.threadpin-dock__list')?.textContent).toContain('2');

    document.querySelector('.threadpin-dock')?.remove();
    await Promise.resolve();

    expect(document.querySelector('.threadpin-dock')).not.toBeNull();

    secondDock.refresh({ bookmarkCount: 3 });

    expect(document.querySelector('.threadpin-dock__list')?.textContent).toContain('3');
  });
});
