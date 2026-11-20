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

/**
 * Keys of the plan editor (stage 2.1), or null: Ctrl+Z — undo, Ctrl+Y and Ctrl+Shift+Z — redo
 * (Cmd on a Mac), Delete and Backspace — delete the selection, the arrows — move it by one step of
 * the plan grid ({ move: [±1 | 0, ±1 | 0] }, +1 is +X right and +Y up). Inside a text field the
 * keys keep their own meaning (`inField`).
 */
export function editorKey(e, inField = false) {
  if (inField) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey) {
    const z = e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z', y = e.code === 'KeyY' || e.key === 'y' || e.key === 'Y';
    if (z) return e.shiftKey ? 'redo' : 'undo';
    if (y && !e.shiftKey) return 'redo';
    return null;
  }
  if (mod || e.altKey) return null;
  if (e.key === 'Delete' || e.key === 'Backspace') return 'delete';
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  return arrows[e.key] ? { move: arrows[e.key] } : null;
}
