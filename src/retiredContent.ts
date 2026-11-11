import type { AppState, Passage } from './types';
// Identifiers only: retired question text is deliberately not retained.
export const retiredGeneratedIds = new Set([
  'city-gardens',
  'learning-breaks',
  'quiet-oceans',
  'sleep-memory',
  'library-listening',
  'campus-listening',
  'useful-mistakes',
  'focused-work',
  'my-reading-2024-01',
]);
export function isRetiredGeneratedPassage(p: Pick<Passage, 'id' | 'source'>) {
  return (
    retiredGeneratedIds.has(p.id) ||
    /Lingo.*原创|原创.*(?:练习|听力|题型)|非历年真题|在此填写题目来源与使用授权说明/.test(p.source)
  );
}
export function removeRetiredContent(state: AppState): AppState {
  const removed = new Set(retiredGeneratedIds);
  for (const p of state.customPassages) if (isRetiredGeneratedPassage(p)) removed.add(p.id);
  const customPassages = state.customPassages.filter((p) => !removed.has(p.id));
  const attempts = state.attempts.filter((a) => !removed.has(a.passageId));
  const drafts = Object.fromEntries(
    Object.entries(state.drafts).filter(([id]) => !removed.has(id)),
  );
  if (
    customPassages.length === state.customPassages.length &&
    attempts.length === state.attempts.length &&
    Object.keys(drafts).length === Object.keys(state.drafts).length
  )
    return state;
  return { ...state, customPassages, attempts, drafts };
}
