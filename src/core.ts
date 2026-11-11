import { dedupePassages } from './dedup';
import type { SourceMaterial } from './types';
import { StateSchema, BankSchema, type AppState, type Attempt, type Passage } from './types';
import { isRetiredGeneratedPassage, removeRetiredContent } from './retiredContent';
export const uid = () => crypto.randomUUID();
export const today = (d = new Date()) => {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};
export const formatTime = (s: number) =>
  String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
export function parseBank(raw: string): Passage[] {
  if (raw.length > 40000000) throw Error('文件超过 40 MB');
  const result = BankSchema.safeParse(JSON.parse(raw));
  if (!result.success) throw Error('题库格式不正确：' + result.error.issues[0].message);
  for (const p of result.data.passages) {
    if (isRetiredGeneratedPassage(p))
      throw Error('该篇属于已移除的旧版内置内容，请使用自己的资料重新导入');
    if (!p.provenance || !p.source.trim()) throw Error('请填写内容类别与来源信息');
    if (result.data.contentType === 'past-paper' && p.provenance.kind !== 'past-paper')
      throw Error('真题容器不能混入个人练习或 AI 自创内容');
    if (p.provenance.kind === 'past-paper') {
      if (/原创|模拟|生成|sample|mock|test.only/i.test(p.source))
        throw Error('模拟题和 AI 自创题请归入个人练习，不能标记为真题');
      if (!/^(19|20)\d{2}$/.test(p.year) && !(p.year === '' && p.provenance.metadata?.year === 'unknown'))
        throw Error('真题年份应为四位年份，未知年份需标记待核实');
    }
  }
  return result.data.passages;
}
export function parseBackup(raw: string): AppState {
  if (raw.length > 200000000) throw Error('备份超过 200 MB');
  const state = StateSchema.parse(JSON.parse(raw));
  const ids = state.customPassages.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw Error('备份中的篇目 ID 重复');
  return removeRetiredContent(state);
}
export function latestAttempts(a: Attempt[]) {
  const m = new Map<string, Attempt>();
  for (const row of a) m.set(row.passageId + '/' + row.questionId, row);
  return [...m.values()];
}
export function skillStats(a: Attempt[]) {
  const m = new Map<string, { skill: string; total: number; wrong: number }>();
  for (const t of a) {
    const v = m.get(t.skill) ?? { skill: t.skill, total: 0, wrong: 0 };
    v.total++;
    if (!t.correct) v.wrong++;
    m.set(t.skill, v);
  }
  return [...m.values()].sort((a, b) => b.wrong / b.total - a.wrong / a.total);
}
export function alignWords(reference: string, spoken: string) {
  const tokens = (v: string) => v.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  const a = tokens(reference),
    b = tokens(spoken);
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const matched = new Set<number>();
  let i = a.length,
    j = b.length;
  while (i && j) {
    if (a[i - 1] === b[j - 1]) {
      matched.add(--i);
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return {
    words: a.map((word, index) => ({ word, matched: matched.has(index) })),
    coverage: a.length ? Math.round((100 * matched.size) / a.length) : 0,
  };
}
export function reviewDate(level: number, now = new Date()) {
  return new Date(
    now.getTime() + [1, 2, 4, 7, 14, 30, 60, 90, 120][Math.min(8, Math.max(0, level))] * 86400000,
  ).toISOString();
}
export function mergeBank(existing: Passage[], incoming: Passage[], builtins: Passage[], materials: SourceMaterial[] = []) {
  const result = dedupePassages(existing,incoming,builtins,materials);
  return { ...result, passages:[...existing,...result.added], added:result.added.length, newPassages:result.added };
}
