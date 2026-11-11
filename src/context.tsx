import { createContext, useContext } from 'react';
import type { CompanionIntent } from './companionCoach';
import type { BankFilters } from './bankFilters';
import type { Mood } from './VrmAvatar';
import type { AppState, Page, Passage, Skill } from './types';
export type StudyContext = {
  state: AppState;
  page: Page;
  askCompanion: (question?: string, intent?: CompanionIntent) => void;
  cueCompanion: (cue: { text: string; mood: Mood }) => void;
  update: (fn: (s: AppState) => AppState) => void;
  go: (page: Page) => void;
  start: (p: Passage, retry?: boolean) => void;
  begin: () => void;
  bankFilters: BankFilters;
  setBankFilters: (filters: BankFilters) => void;
  skill: Skill;
  setSkill: (skill: Skill) => void;
  current: string;
  autoStart: boolean;
  addContent: (seed?: Passage) => void;
  bank: Passage[];
  toast: (text: string) => void;
  setNote: (
    v: { passageId: string; quote: string; body?: string; id?: string; paragraph?: number } | null,
  ) => void;
};
export const Study = createContext<StudyContext>(null!);
export const useStudy = () => useContext(Study);
