import { examNames } from './data';
import { defaultBankFilters, matchesSkill, passageYear, type BankFilters } from './bankFilters';
import { useStudy } from './context';
import type { Exam } from './types';

export default function BankFilterControls() {
  const { bank, skill, bankFilters: filters, setBankFilters } = useStudy();
  const years = [...new Set(bank.filter(p => matchesSkill(p,skill)).map(passageYear))]
    .sort((a,b) => (parseInt(b) || 0) - (parseInt(a) || 0) || b.localeCompare(a));
  const patch = (value: Partial<BankFilters>) => setBankFilters({ ...filters, ...value });
  const active = Object.keys(defaultBankFilters).some(key =>
    filters[key as keyof BankFilters] !== defaultBankFilters[key as keyof BankFilters]);
  return (
    <div className="bank-filters" role="group" aria-label="题库筛选">
      <label>考试范围
        <select id="bank-exam-filter" aria-label="考试范围" value={filters.exam}
          onChange={e => patch({ exam: e.target.value as 'all' | Exam })}>
          <option value="all">全部考试</option>
          {(Object.keys(examNames) as Exam[]).map(exam =>
            <option key={exam} value={exam}>{examNames[exam]}</option>)}
        </select>
      </label>
      <label>年份
        <select aria-label="题目年份" value={filters.year} onChange={e => patch({ year: e.target.value })}>
          <option value="all">全部年份</option>
          {years.map(year => <option key={year} value={year}>{year === 'unknown' ? '年份待核实' : year}</option>)}
          {filters.year !== 'all' && !years.includes(filters.year) &&
            <option value={filters.year}>{filters.year === 'unknown' ? '年份待核实' : filters.year}</option>}
        </select>
      </label>
      <label>难度
        <select aria-label="题目难度" value={filters.difficulty}
          onChange={e => patch({ difficulty: e.target.value as BankFilters['difficulty'] })}>
          <option value="all">全部难度</option>
          {['基础','进阶','挑战'].map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label>学习进度
        <select aria-label="学习进度" value={filters.progress}
          onChange={e => patch({ progress: e.target.value as BankFilters['progress'] })}>
          <option value="all">全部进度</option>
          <option value="unstarted">未开始</option>
          <option value="ongoing">进行中</option>
          <option value="completed">已完成</option>
        </select>
      </label>
      <label>排序
        <select aria-label="题目排序" value={filters.sort}
          onChange={e => patch({ sort: e.target.value as BankFilters['sort'] })}>
          <option value="default">默认顺序</option>
          <option value="year">年份从新到旧</option>
          <option value="title">标题顺序</option>
        </select>
      </label>
      <button className="text-link clear-bank-filters" disabled={!active}
        onClick={() => setBankFilters({ ...defaultBankFilters })}>清除筛选</button>
      {filters.progress !== 'all' && <p className="bank-filter-note">
        阅读与听力按答题进度筛选；写作有草稿即为进行中。文章暂不记录完成状态。
      </p>}
    </div>
  );
}
