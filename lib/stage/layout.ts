export type PresenterShape = 'circle' | 'rect' | 'hidden';
export type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface PresenterLayout {
  shape: PresenterShape;
  corner: Corner;
  /** Presenter width as a percentage of the stage width. */
  sizePct: number;
}

export const DEFAULT_LAYOUT: PresenterLayout = { shape: 'circle', corner: 'bottom-right', sizePct: 22 };

const MIN_SIZE = 10;
const MAX_SIZE = 40;

export function clampLayout(l: PresenterLayout): PresenterLayout {
  const size = Number.isFinite(l.sizePct) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, l.sizePct)) : DEFAULT_LAYOUT.sizePct;
  return { ...l, sizePct: size };
}

/**
 * Inline style for the presenter box, positioned inside a relatively positioned stage.
 * Percent insets keep the layout identical at any stage size, so a recording looks like the preview.
 */
export function presenterStyle(layout: PresenterLayout): Record<string, string | number> {
  const l = clampLayout(layout);
  if (l.shape === 'hidden') return { display: 'none' };
  const [vertical, horizontal] = l.corner.split('-') as ['top' | 'bottom', 'left' | 'right'];
  return {
    position: 'absolute',
    [vertical]: '4%',
    [horizontal]: '2.5%',
    width: `${l.sizePct}%`,
    aspectRatio: l.shape === 'circle' ? '1 / 1' : '16 / 9',
    borderRadius: l.shape === 'circle' ? '50%' : '12px',
    overflow: 'hidden',
  };
}
