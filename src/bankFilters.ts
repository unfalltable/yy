import type { AppState, Exam, Passage, Skill } from './types';
import { originOf } from './importCore';

export type BankFilters = {
  exam: 'all' | Exam;
  year: string;
  difficulty: 'all' | Passage['difficulty'];
  progress: 'all' | 'unstarted' | 'ongoing' | 'completed';
  origin: 'all' | NonNullable<Passage['provenance']>['kind'];
  query: string;
  sort: 'default' | 'year' | 'title';
};
export const defaultBankFilters: BankFilters = {
  exam: 'all', year: 'all', difficulty: 'all', progress: 'all',
  origin: 'all', query: '', sort: 'default',
};
export function matchesSkill(p: Passage, skill: Skill) {
  return skill === 'speaking' || p.kind === skill || (skill === 'reading' && p.kind === 'article');
}
export function passageProgress(p: Passage, state: AppState): BankFilters['progress'] | null {
  if (p.kind === 'writing') return state.writingDrafts[p.id]?.text.trim() ? 'ongoing' : 'unstarted';
  if (p.kind === 'article') return null;
  const draft = state.drafts[p.id];
  return draft?.finished ? 'completed' : draft ? 'ongoing' : 'unstarted';
}
export const passageYear = (p: Passage) => p.year.trim() || 'unknown';
export function filterBank(bank: Passage[], state: AppState, filters: BankFilters, skill: Skill) {
  const query = filters.query.trim().toLocaleLowerCase();
  const rows = bank.filter(p =>
    matchesSkill(p, skill) &&
    (filters.exam === 'all' || p.exam === filters.exam) &&
    (filters.year === 'all' || passageYear(p) === filters.year) &&
    (filters.difficulty === 'all' || p.difficulty === filters.difficulty) &&
    (filters.progress === 'all' || passageProgress(p, state) === filters.progress) &&
    (filters.origin === 'all' || originOf(p) === filters.origin) &&
    [p.title, p.subtitle, p.exam, p.year, p.source, p.provenance?.paper, p.provenance?.reference]
      .join(' ').toLocaleLowerCase().includes(query),
  );
  if (filters.sort === 'year') rows.sort((a,b) =>
    (parseInt(b.year) || 0) - (parseInt(a.year) || 0) || a.title.localeCompare(b.title, 'zh-CN'));
  if (filters.sort === 'title') rows.sort((a,b) => a.title.localeCompare(b.title, 'zh-CN', { numeric: true }));
  return rows;
}
