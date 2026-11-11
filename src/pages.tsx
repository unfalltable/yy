import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  Headphones,
  Import,
  Lightbulb,
  NotebookPen,
  Play,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Volume2,
  RotateCcw,
  ExternalLink,
  TrendingUp,
  Bookmark,
  Download,
} from 'lucide-react';
import { useStudy } from './context';
import { Mascot } from './Mascot';
import { Empty, IconButton, Modal, PassageCard, SectionTitle, TextLink } from './ui';
import { latestAttempts, mergeBank, parseBank, reviewDate, skillStats, today } from './core';
import { passages, examNames } from './data';
import { exportJson, openLink } from './storage';
import { speak } from './speech';
import { originName } from './importCore';
import { defaultBankFilters, filterBank, type BankFilters } from './bankFilters';
import BankFilterControls from './BankFilterControls';
export function Library({ picker = false }: { picker?: boolean }) {
  const { state, bank, update, toast, start, skill, autoStart, addContent, bankFilters, setBankFilters } = useStudy();
  const [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState<import('./types').Passage | null>(null);
  const { query, origin: filter } = bankFilters;
  async function importBank(file: File) {
    setBusy(true);
    try {
      const incoming = parseBank(await file.text()),
        result = mergeBank(state.customPassages, incoming, passages, state.materials);
      if (result.passages.length > 500) throw Error('题库最多500篇，请先整理不需要的内容');
      update((s) => ({
        ...s,
        customPassages: mergeBank(s.customPassages, incoming, passages, s.materials).passages,
      }));
      const next = filterBank([...result.newPassages,...result.passages],state,bankFilters,skill)[0];
      if (autoStart && next) start(next);
      toast('导入 ' + result.added + ' 篇内容，跳过 ' + result.skipped + ' 篇重复或同 ID 篇目、' + result.skippedQuestions + ' 道重复题');
    } catch (e) {
      toast(e instanceof Error ? e.message : '导入失败，请检查题库JSON格式');
    } finally {
      setBusy(false);
    }
  }
  const rows = filterBank(bank,state,bankFilters,skill);
  const filtered = Object.keys(defaultBankFilters).some(key => bankFilters[key as keyof BankFilters] !== defaultBankFilters[key as keyof BankFilters]);
  return (
    <>
      {!picker && <div className="page-heading">
        <div>
          <h1>我的题库</h1>
          <p>
            {autoStart
              ? '直接选题开始，所有考试都可以练。'
              : '按考试、年份和进度选题，也可以跨考试练习。'}
          </p>
        </div>
        <button className="primary" onClick={() => addContent()}>
          <Plus size={17} />
          添加题目 / AI出题
        </button>
      </div>}
      <BankFilterControls />
      <div className="filter-bar">
        <div className="segmented library-origins" aria-label="内容来源">
          {[
            ['all', '全部内容'],
            ['past-paper', '真题'],
            ['practice', '个人练习'],
            ['ai-generated', 'AI自创'],
            ['article', '文章'],
          ].map(([id, name]) => (
            <button
              key={id}
              className={filter === id ? 'selected' : ''}
              aria-pressed={filter === id}
              onClick={() => setBankFilters({ ...bankFilters, origin: id as BankFilters['origin'] })}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="搜索题库"
            placeholder="搜索标题、来源或年份"
            value={query}
            onChange={(e) => setBankFilters({ ...bankFilters, query: e.target.value })}
          />
        </label>
      </div>
      <div className="row spread library-count">
        <span>共 {rows.length} 篇内容</span>
        <span>
          <Check size={14} />
          支持断点续做
        </span>
      </div>
      {rows.length ? (
        <div className="library-grid">
          {rows.map((p) => (
            <PassageCard
              key={p.id}
              passage={p}
              onDelete={
                !picker && state.customPassages.some((x) => x.id === p.id) ? () => setDeleting(p) : undefined
              }
            />
          ))}
        </div>
      ) : (
        <Empty
          title={bank.length ? '没有匹配的内容' : '添加你的第一份学习资料'}
          detail={filtered ? '换个筛选条件，或清除筛选查看当前学习方式的全部内容。' : '上传照片、PDF、Word或文章；可提取原题，也可让AI创建个人练习。'}
          action={
            filtered ? <button className="secondary" onClick={() => setBankFilters({ ...defaultBankFilters })}>查看全部题目</button> : <button className="secondary" onClick={() => addContent()}>
              添加学习资料
              <ArrowRight size={15} />
            </button>
          }
        />
      )}
      {!picker && <details className="source-note">
        <summary>题库JSON与来源说明</summary>
        <div>
          <p>
            历年真题保留年份和原始出处；模拟题、学习文章、AI自创分别标记。导入资料由你提供，AI识别和补全的结果可在入库前修改核对。
          </p>
          <label className={'secondary file-button ' + (busy ? 'disabled' : '')}>
            <Import size={16} />
            {busy ? '导入中…' : '导入题库JSON'}
            <input
              id="bank-json"
              aria-label="导入题库JSON"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importBank(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <button
          className="text-link"
          onClick={() =>
            exportJson('lingo-personal-bank-template.json', {
              version: 1,
              contentType: 'personal-bank',
              passages: [],
            })
          }
        >
          <Download size={16} />
          下载空白导入模板
        </button>
      </details>}
      {deleting && (
        <Modal title="删除这篇内容？" onClose={() => setDeleting(null)}>
          <p>
            {deleting.title}（{originName(deleting)}）
          </p>
          <p className="callout">
            将移除此篇内容、答题进度和作答记录；个人笔记保留。没有其他篇目引用的原资料图片也会移除。
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setDeleting(null)}>
              保留内容
            </button>
            <button
              className="primary danger-button"
              onClick={() => {
                update((s) => {
                  const customPassages = s.customPassages.filter((p) => p.id !== deleting.id),
                    drafts = { ...s.drafts },
                    writingDrafts = { ...s.writingDrafts };
                  delete drafts[deleting.id];
                  delete writingDrafts[deleting.id];
                  return {
                    ...s,
                    customPassages,
                    drafts,
                    writingDrafts,
                    attempts: s.attempts.filter((a) => a.passageId !== deleting.id),
                    materials: s.materials.filter(
                      (m) =>
                        m.id !== deleting.materialId ||
                        customPassages.some((p) => p.materialId === m.id),
                    ),
                  };
                });
                setDeleting(null);
                toast('内容已删除，个人笔记保留');
              }}
            >
              删除此篇内容
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Mistakes() {
  const { state, bank, start, update, go } = useStudy();
  const [skill, setSkill] = useState('全部');
  const rows = latestAttempts(state.attempts).filter((a) => !a.correct);
  const skills = [...new Set(rows.map((a) => a.skill))];
  return (
    <>
      <div className="page-heading">
        <div className="greeting">把“为什么错”变成“下次会”</div>
        <h1>
          错题回顾 <span className="count-pill">{rows.length}</span>
        </h1>
        <p>展示每道题的最近一次结果。重做答对后，会自动移出待攻克列表。</p>
      </div>
      <div className="filter-bar">
        <div className="segmented">
          {['全部', ...skills].map((s) => (
            <button key={s} className={skill === s ? 'selected' : ''} onClick={() => setSkill(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
      {rows.length ? (
        <div className="mistake-list">
          {rows
            .filter((a) => skill === '全部' || a.skill === skill)
            .map((a) => {
              const p = bank.find((p) => p.id === a.passageId),
                q = p?.questions.find((q) => q.id === a.questionId);
              if (!p || !q) return null;
              return (
                <article className="mistake-card" key={a.id}>
                  <div className="row spread">
                    <span className="tag peach">{a.skill}</span>
                    <span className="muted">
                      {p.exam} · {p.title}
                    </span>
                  </div>
                  <h3>{q.stem}</h3>
                  <div className="answer-comparison">
                    <span>
                      我的选择 <b>{q.options[a.selected]}</b>
                    </span>
                    <span>
                      正确答案 <b>{q.options[q.answer]}</b>
                    </span>
                  </div>
                  <p>{q.explanation}</p>
                  <div className="mistake-footer">
                    <label>
                      这次卡在哪里？
                      <select
                        aria-label={'错因 ' + q.id}
                        value={a.reason ?? ''}
                        onChange={(e) =>
                          update((s) => ({
                            ...s,
                            attempts: s.attempts.map((t) =>
                              t.id === a.id ? { ...t, reason: e.target.value } : t,
                            ),
                          }))
                        }
                      >
                        <option value="">记录我的错因</option>
                        {[
                          '单词不熟',
                          '定位错误',
                          '长难句没读懂',
                          '忽略限定词',
                          '推断过度',
                          '听漏关键信息',
                          '时间不够',
                        ].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    <button className="secondary" onClick={() => start(p, true)}>
                      <RotateCcw size={16} />
                      重做这一篇
                    </button>
                  </div>
                </article>
              );
            })}
        </div>
      ) : (
        <Empty
          title="还没有待攻克的错题"
          detail="完成练习后，答错的题目会自动收集在这里。"
          action={
            <button
              className="primary"
              onClick={() => {
                const p = bank.find((p) => p.exam === state.settings.exam) ?? bank[0];
                if (p) start(p);
                else go('library');
              }}
            >
              开始一篇练习
              <ArrowRight size={16} />
            </button>
          }
        />
      )}
    </>
  );
}
export function Notes() {
  const { state, update, bank, setNote, start } = useStudy();
  const [query, setQuery] = useState('');
  const rows = state.notes.filter((n) =>
    [n.body, n.quote, bank.find((p) => p.id === n.passageId)?.title ?? '']
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="greeting">把理解，留在自己的语言里</div>
          <h1>
            我的笔记 <span className="count-pill">{state.notes.length}</span>
          </h1>
          <p>选中原文可以记笔记、划重点，所有记录都能回到原文。</p>
        </div>
        <button className="secondary" onClick={() => exportJson('lingo-notes.json', state.notes)}>
          <Download size={16} />
          导出笔记
        </button>
      </div>
      <label className="search standalone-search">
        <Search size={17} />
        <input
          placeholder="搜索笔记和原文摘录"
          aria-label="搜索笔记"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {rows.length ? (
        <div className="notes-grid">
          {rows.map((n) => {
            const p = bank.find((p) => p.id === n.passageId);
            return (
              <article className="note-card" key={n.id}>
                <div className="row spread">
                  <span className="note-date">{new Date(n.at).toLocaleDateString()}</span>
                  <div className="row">
                    <IconButton label="编辑笔记" onClick={() => setNote(n)}>
                      <NotebookPen size={16} />
                    </IconButton>
                    <IconButton
                      label="删除笔记"
                      onClick={() =>
                        update((s) => ({ ...s, notes: s.notes.filter((v) => v.id !== n.id) }))
                      }
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>
                {n.quote && <blockquote>{n.quote}</blockquote>}
                <p className="note-body">{n.body}</p>
                <button className="note-origin" onClick={() => p && start(p)}>
                  <BookOpen size={14} />
                  {p?.title ?? '原题已移除，笔记保留'}
                  <ArrowUpRight size={15} />
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title={query ? '没有匹配的笔记' : '第一条笔记，从一个灵感开始'}
          detail="在阅读中选中一段文字，点击「记笔记」。"
        />
      )}
    </>
  );
}
export function Words() {
  const { state, update, toast } = useStudy();
  const [query, setQuery] = useState(''),
    [review, setReview] = useState(false),
    [reveal, setReveal] = useState(false);
  const due = state.words.filter((w) => new Date(w.due) <= new Date());
  const word = due[0];
  const rows = state.words.filter((w) =>
    (w.word + ' ' + w.meaning).toLowerCase().includes(query.toLowerCase()),
  );
  function rate(remembered: boolean) {
    if (!word) return;
    update((s) => ({
      ...s,
      words: s.words.map((w) =>
        w.id === word.id
          ? {
              ...w,
              level: remembered ? Math.min(8, w.level + 1) : 0,
              due: remembered ? reviewDate(w.level) : new Date(Date.now() + 600000).toISOString(),
            }
          : w,
      ),
    }));
    setReveal(false);
    toast(remembered ? '已安排下次复习' : '10 分钟后再复习一次');
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="greeting">和每一个新词，再见一面</div>
          <h1>
            生词本 <span className="count-pill">{state.words.length}</span>
          </h1>
          <p>从阅读语境中积累，用间隔复习慢慢记牢。</p>
        </div>
        <button
          className="primary"
          disabled={!due.length}
          onClick={() => {
            setReview(true);
            setReveal(false);
          }}
        >
          <RotateCcw size={16} />
          复习到期单词 <span className="button-badge">{due.length}</span>
        </button>
      </div>
      <label className="search standalone-search">
        <Search size={17} />
        <input
          aria-label="搜索生词"
          placeholder="搜索单词或释义"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {rows.length ? (
        <div className="word-list">
          {rows.map((w) => (
            <article key={w.id}>
              <div className="word-main">
                <strong>{w.word}</strong>
                <IconButton label={'朗读 ' + w.word} onClick={() => speak(w.word, 1, toast)}>
                  <Volume2 size={16} />
                </IconButton>
                <span className={'tag ' + (new Date(w.due) <= new Date() ? 'violet' : '')}>
                  {new Date(w.due) <= new Date()
                    ? '待复习'
                    : new Date(w.due).toLocaleDateString() + ' 复习'}
                </span>
              </div>
              <p>{w.meaning}</p>
              <blockquote>{w.context || '没有上下文摘录'}</blockquote>
              <IconButton
                label={'删除生词 ' + w.word}
                onClick={() =>
                  update((s) => ({ ...s, words: s.words.filter((x) => x.id !== w.id) }))
                }
              >
                <Trash2 size={15} />
              </IconButton>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={query ? '没有匹配的生词' : '把读到的新词收藏起来'}
          detail="阅读时选中单词，在翻译卡片中点击「加入生词本」。"
        />
      )}
      {review && (
        <Modal title="和单词再见一面" onClose={() => setReview(false)}>
          {word ? (
            <div className="flashcard">
              <span className="tag">{due.length} 个待复习</span>
              <h2>{word.word}</h2>
              <IconButton label="朗读当前生词" onClick={() => speak(word.word, 1, toast)}>
                <Volume2 size={22} />
              </IconButton>
              {reveal ? (
                <>
                  <p>{word.meaning}</p>
                  <blockquote>{word.context}</blockquote>
                  <div className="row">
                    <button className="secondary" onClick={() => rate(false)}>
                      还不太熟
                    </button>
                    <button className="primary" onClick={() => rate(true)}>
                      记住了
                      <Check size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <button className="primary" onClick={() => setReveal(true)}>
                  看看释义
                </button>
              )}
            </div>
          ) : (
            <Empty title="这一轮复习完成啦" detail="等新单词到期，再回来看看。" />
          )}
        </Modal>
      )}
    </>
  );
}
export function Insights() {
  const { state, go, toast } = useStudy();
  const [ai, setAi] = useState(''),
    [loading, setLoading] = useState(false);
  const stats = skillStats(state.attempts);
  const correct = state.attempts.filter((a) => a.correct).length;
  const hintUses = state.attempts.reduce((n, a) => n + a.hints, 0);
  const reasons = Object.entries(
    state.attempts.reduce<Record<string, number>>((m, a) => {
      if (a.reason) m[a.reason] = (m[a.reason] ?? 0) + 1;
      return m;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  async function analyze() {
    if (!window.desktop || !state.settings.aiEndpoint || !state.settings.aiModel) {
      toast('请先在桌面端偏好设置中配置 AI 服务');
      go('settings');
      return;
    }
    setLoading(true);
    try {
      setAi(
        await window.desktop.ai({
          endpoint: state.settings.aiEndpoint,
          model: state.settings.aiModel,
          prompt:
            '请分析以下英语练习统计，给出 3 个可执行的改进建议。不推断人格或未经观测的行为。数据：' +
            JSON.stringify({
              attempts: state.attempts.length,
              correct,
              skillStats: stats,
              reasons,
              hintUses,
              activeMinutes: Math.floor(
                Object.values(state.activity).reduce((a, b) => a + b, 0) / 60,
              ),
            }),
        }),
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : '分析失败');
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="greeting">看见努力，也看见下一步</div>
          <h1>学习报告</h1>
          <p>统计来自你的实际记录；同一题的多次作答分别计入训练次数。</p>
        </div>
        <button className="primary" disabled={loading || !state.attempts.length} onClick={analyze}>
          <Sparkles size={17} />
          {loading ? '正在分析…' : 'AI 分析我的短板'}
        </button>
      </div>
      <div className="report-stats">
        <div>
          <BookOpen />
          <p>累计作答</p>
          <strong>
            {state.attempts.length}
            <small> 次</small>
          </strong>
        </div>
        <div>
          <Target />
          <p>训练正确率</p>
          <strong>
            {state.attempts.length
              ? Math.round((correct / state.attempts.length) * 100) + '%'
              : '—'}
          </strong>
        </div>
        <div>
          <Clock3 />
          <p>累计专注</p>
          <strong>
            {Math.floor(Object.values(state.activity).reduce((a, b) => a + b, 0) / 60)}
            <small> 分钟</small>
          </strong>
        </div>
        <div>
          <Lightbulb />
          <p>使用提示</p>
          <strong>
            {hintUses}
            <small> 次</small>
          </strong>
        </div>
      </div>
      {stats.length ? (
        <div className="report-grid">
          <section className="panel">
            <SectionTitle
              title="哪个环节值得多练一点？"
              detail="按题型统计失误比例，样本越多越有参考价值。"
            />
            {stats.map((s) => (
              <div className="skill-row" key={s.skill}>
                <div className="row spread">
                  <strong>{s.skill}</strong>
                  <span>
                    {s.wrong} / {s.total} 次失误
                  </span>
                </div>
                <div className="progress">
                  <i style={{ width: (s.wrong / s.total) * 100 + '%' }} />
                </div>
              </div>
            ))}
          </section>
          <section className="panel">
            <SectionTitle title="找到自己的出错模式" />
            {reasons.length ? (
              reasons.map(([reason, count]) => (
                <div className="reason-row" key={reason}>
                  <span>{reason}</span>
                  <strong>{count} 次</strong>
                </div>
              ))
            ) : (
              <div className="insight-tip">
                <Lightbulb size={25} />
                <h3>多问一句“为什么”</h3>
                <p>在错题回顾中记录错因，这里就会逐渐呈现你的薄弱环节。</p>
                <button className="secondary" onClick={() => go('mistakes')}>
                  去记录错因
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
            {stats[0] && (
              <p className="callout">
                当前建议：先练「{stats[0].skill}」。对照解析找依据，再用自己的话解释每个干扰项。
              </p>
            )}
          </section>
        </div>
      ) : (
        <Empty
          title="完成第一篇，认识自己的起点"
          detail="有了真实作答记录，题型短板和错因分布会在这里出现。"
          action={
            <button className="primary" onClick={() => go('library')}>
              去题库练习
              <ArrowRight size={16} />
            </button>
          }
        />
      )}
      {ai && (
        <section className="panel ai-report">
          <SectionTitle title="AI 陪练建议" detail="由你配置的模型生成，请结合原题核对。" />
          <div className="prose-text">{ai}</div>
        </section>
      )}
      <div className="privacy-note">
        <Check size={16} />
        仅在开启记录时统计应用内的活跃练习时间。不会记录其他软件、键盘内容或浏览历史。AI
        分析只在你点击时发送汇总数据。
      </div>
    </>
  );
}
