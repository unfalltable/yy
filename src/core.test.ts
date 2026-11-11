import { describe, expect, it } from 'vitest';
import { parseBank, parseBackup, mergeBank, latestAttempts, alignWords, reviewDate } from './core';
import { passages } from './data';
import { defaults, type Attempt } from './types';
import { retiredGeneratedIds, removeRetiredContent } from './retiredContent';
import { schemaRecord, bankEnvelope } from '../tests/schema-fixture';
const draft = {
  answers: {},
  hints: {},
  seconds: 1,
  index: 0,
  finished: false,
  checked: [],
  times: {},
};
const attempt = (passageId: string): Attempt => ({
  id: passageId,
  passageId,
  questionId: 'field',
  selected: 0,
  correct: false,
  skill: 'field',
  seconds: 1,
  hints: 0,
  at: '2000-01-01T00:00:00Z',
});
describe('真题内容约束', () => {
  it('发布的内置题库为空', () => expect(passages).toEqual([]));
  it('只接收声明为历年真题且注明出处的资料', () => {
    expect(parseBank(JSON.stringify(bankEnvelope([schemaRecord()])))).toHaveLength(1);
    expect(() => parseBank(JSON.stringify({ version: 1, passages: [schemaRecord()] }))).toThrow();
  });
  it('缺少出处、年份或真题元数据时拒绝导入', () => {
    for (const p of [
      schemaRecord({ source: '' }),
      schemaRecord({ year: '' }),
      schemaRecord({ provenance: undefined }),
    ])
      expect(() => parseBank(JSON.stringify(bankEnvelope([p])))).toThrow();
  });
  it('拒绝生成、模拟和样题来源，含旧题 ID', () => {
    for (const source of ['Lingo 原创练习', '模拟题', '生成题', 'official sample'])
      expect(() => parseBank(JSON.stringify(bankEnvelope([schemaRecord({ source })])))).toThrow();
    expect(() =>
      parseBank(JSON.stringify(bankEnvelope([schemaRecord({ id: 'city-gardens' })]))),
    ).toThrow();
  });
  it('拒绝超出范围的答案及重复 ID', () => {
    const p = schemaRecord();
    p.questions[0].answer = 2;
    expect(() => parseBank(JSON.stringify(bankEnvelope([p])))).toThrow('答案超出');
    const q = schemaRecord();
    q.questions.push(q.questions[0]);
    expect(() => parseBank(JSON.stringify(bankEnvelope([q])))).toThrow('ID 重复');
    expect(() =>
      parseBank(JSON.stringify(bankEnvelope([schemaRecord(), schemaRecord()]))),
    ).toThrow();
  });
  it('同 ID 的导入不会覆盖用户资料', () => {
    const a = schemaRecord();
    const r = mergeBank([a], [{ ...a, title: '[OTHER_FIELD]' }, schemaRecord({ id: 'other' })], []);
    expect(r.added).toBe(0);
    expect(r.skipped).toBe(2);
    expect(r.passages[0].title).toBe('[TITLE_FIELD]');
  });
});
describe('旧生成内容清理', () => {
  it('清理全部旧题草稿与作答，并保留用户笔记、生词、真题和设置', () => {
    const state = structuredClone(defaults);
    state.customPassages = [
      schemaRecord(),
      schemaRecord({ id: 'city-gardens' }),
      schemaRecord({ id: 'renamed-generated', source: 'Lingo 原创练习' }),
    ];
    const ids = [...retiredGeneratedIds, 'renamed-generated'];
    state.attempts = [...ids.map(attempt), attempt('schema-record')];
    state.drafts = Object.fromEntries([...ids, 'schema-record'].map((id) => [id, { ...draft }]));
    state.notes = [
      {
        id: 'note',
        passageId: 'city-gardens',
        quote: '[USER_QUOTE]',
        body: '[USER_NOTE]',
        at: '2000-01-01',
      },
    ];
    state.words = [
      {
        id: 'word',
        word: '[USER_WORD]',
        meaning: '[MEANING]',
        context: '',
        at: '2000-01-01',
        due: '2000-01-01',
        level: 0,
      },
    ];
    const cleaned = removeRetiredContent(state);
    expect(cleaned.customPassages.map((p) => p.id)).toEqual(['schema-record']);
    expect(cleaned.attempts.map((a) => a.passageId)).toEqual(['schema-record']);
    expect(Object.keys(cleaned.drafts)).toEqual(['schema-record']);
    expect(cleaned.notes).toEqual(state.notes);
    expect(cleaned.words).toEqual(state.words);
    expect(cleaned.settings).toBe(state.settings);
    expect(removeRetiredContent(cleaned)).toBe(cleaned);
  });
  it('恢复旧备份不能重新带回生成题', () => {
    const state = {
      ...structuredClone(defaults),
      customPassages: [schemaRecord({ id: 'quiet-oceans' })],
      attempts: [attempt('quiet-oceans')],
      drafts: { 'quiet-oceans': draft },
    };
    const restored = parseBackup(JSON.stringify(state));
    expect(restored.customPassages).toHaveLength(0);
    expect(restored.attempts).toHaveLength(0);
    expect(restored.drafts).toEqual({});
  });
  it('拒绝无效备份而不影响现有数据', () => {
    expect(() => parseBackup('{}')).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...defaults, activity: { field: -1 } }))).toThrow();
  });
});
describe('保留的学习逻辑', () => {
  it('最近结果按题目覆盖、跨篇目独立', () =>
    expect(
      latestAttempts([attempt('a'), { ...attempt('a'), correct: true }, attempt('b')]).map(
        (a) => a.correct,
      ),
    ).toEqual([true, false]));
  it('复习间隔保持原有安排', () =>
    expect(reviewDate(0, new Date('2000-01-01T00:00:00Z'))).toBe('2000-01-02T00:00:00.000Z'));
  it('跟读仅按文字顺序匹配', () => expect(alignWords('A B C', 'C B A').coverage).toBe(33));
});

describe('写作真题与旧版本兼容', () => {
  it('写作题保留真实题干与出处，阅读听力不能没有题目', () => {
    expect(
      parseBank(JSON.stringify(bankEnvelope([schemaRecord({ kind: 'writing', questions: [] })])))[0]
        .kind,
    ).toBe('writing');
    for (const kind of ['reading', 'listening'] as const)
      expect(() =>
        parseBank(JSON.stringify(bankEnvelope([schemaRecord({ kind, questions: [] })]))),
      ).toThrow('至少包含一道题');
    expect(() =>
      parseBank(
        JSON.stringify(
          bankEnvelope([schemaRecord({ kind: 'writing', questions: [], provenance: undefined })]),
        ),
      ),
    ).toThrow('来源信息');
  });
  it('旧备份补齐写作草稿，不影响原有记录', () => {
    const old = structuredClone(defaults) as Partial<typeof defaults>;
    delete old.writingDrafts;
    const recovered = parseBackup(JSON.stringify(old));
    expect(recovered.writingDrafts).toEqual({});
    expect(recovered.settings.companionName).toBe(defaults.settings.companionName);
  });
});
