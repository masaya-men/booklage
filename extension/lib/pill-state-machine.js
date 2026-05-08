// Pure state-machine for the Booklage cursor pill.
// Imported by content.js + tests/extension/cursor-pill.test.ts.

export const PILL_STATES = ['saving', 'saved', 'error']

export function pillStateView(state) {
  if (state === 'saving') return { label: 'Saving', icon: 'ring',  autoHideMs: null }
  if (state === 'saved')  return { label: 'Saved',  icon: 'check', autoHideMs: 1200 }
  if (state === 'error')  return { label: 'Failed', icon: 'bang',  autoHideMs: 2400 }
  return null  // unknown state -> caller should ignore
}
