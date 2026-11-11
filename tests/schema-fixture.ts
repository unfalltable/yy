import type { Passage } from '../src/types';
// Opaque schema fields for software tests only; no English exercises or learning content.
export function schemaRecord(overrides: Partial<Passage> = {}): Passage {
  return {
    id: 'schema-record',
    exam: '英一',
    title: '[TITLE_FIELD]',
    subtitle: '[SUBTITLE_FIELD]',
    kind: 'reading',
    year: '2000',
    source: 'SCHEMA_REFERENCE_FIELD',
    difficulty: '基础',
    minutes: 1,
    paragraphs: ['[PARAGRAPH_FIELD]'],
    questions: [
      {
        id: 'schema-question',
        stem: '[STEM_FIELD]',
        options: ['[OPTION_FIELD_0]', '[OPTION_FIELD_1]'],
        answer: 0,
        skill: '[SKILL_FIELD]',
        explanation: '[EXPLANATION_FIELD]',
        evidence: '[EVIDENCE_FIELD]',
        hints: ['[HINT_FIELD]'],
      },
    ],
    provenance: { kind: 'past-paper', paper: '[PAPER_FIELD]', reference: '[REFERENCE_FIELD]' },
    ...overrides,
  };
}
export const bankEnvelope = (records: Passage[]) => ({
  version: 1,
  contentType: 'past-paper',
  passages: records,
});
