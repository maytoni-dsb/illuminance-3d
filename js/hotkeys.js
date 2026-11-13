// Hot keys of the page (stage 7). Pure module: maps a key event to an action; the page performs it.
// The keys also appear in the tooltips of their buttons (data-key) and in the help.

/** Key → action. Function keys work everywhere, also while a field has focus. */
export const HOTKEYS = Object.freeze({
  F1: 'help',        // help on the focused field, else on the current stage
  F2: 'plan',        // 2D view (plan)
  F3: 'view3d',      // 3D view
  F4: 'plane',       // show / hide the work plane (left part of the plane pill)
  F5: 'calc',        // calculate, when the automatic calculation is off
  F9: 'falsecolors', // false colors on / off
  F10: 'reset',      // initial view
});

/**
 * Action of a keydown event, or null. Function keys count only without Ctrl, Alt and Meta (so the
 * browser's own Ctrl+F5 still reloads); Ctrl+S (Cmd+S) saves the project.
 * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean }} e
 */
export function hotkeyAction(e) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) return 'save';
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return HOTKEYS[e.key] ?? null;
}
