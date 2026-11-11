import { useRef, useState, useEffect } from 'react';
import { PenLine, Sparkles, NotebookPen, MessageCircle } from 'lucide-react';
import { useStudy } from './context';
import { Empty } from './ui';
import { CompanionCue as Companion } from './Companion';
import SourceView, { ContentBadge } from './SourceView';
export default function Writing() {
  const { state, update, bank, current, start, go, toast, setNote, addContent, askCompanion } = useStudy();
  const rows = bank.filter((p) => p.kind === 'writing');
  const task = rows.find((p) => p.id === current);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    draftText = useRef('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const draft = task
    ? (state.writingDrafts[task.id] ?? { text: '', feedback: '', updatedAt: '' })
    : { text: '', feedback: '', updatedAt: '' };
  draftText.current = draft.text;
  function edit(text: string) {
    if (!task) return;
    update((s) => ({
      ...s,
      writingDrafts: {
        ...s.writingDrafts,
        [task.id]: { text, feedback: '', updatedAt: new Date().toISOString() },
      },
    }));
  }
  async function review() {
    if (!task || !draft.text.trim()) return;
    if (!window.desktop || !state.settings.aiEndpoint || !state.settings.aiModel) {
      toast('请先配置 AI 服务');
      go('settings');
      return;
    }
    setBusy(true);
    const submitted = draft.text,
      taskId = task.id;
    try {
      const feedback = await window.desktop.ai({
        endpoint: state.settings.aiEndpoint,
        model: state.settings.aiModel,
        prompt:
          '你是英语写作陪练。根据用户提供的真实试题要求及作文，用中文给出切题性、结构、语法、词汇的具体建议，指出原句和建议改法。不得编造评分标准、官方分数、真题或参考答案。不生成整篇代写。试题来源：' +
          task.source +
          '\n题目：' +
          task.paragraphs.join('\n') +
          '\n作文：' +
          submitted,
      });
      if (!mounted.current) return;
      update((s) => {
        const live = s.writingDrafts[taskId];
        if (!live || live.text !== submitted) return s;
        return {
          ...s,
          writingDrafts: {
            ...s.writingDrafts,
            [taskId]: { ...live, feedback: feedback.slice(0, 30000) },
          },
        };
      });
      if (draftText.current !== submitted) toast('作文已有修改，请重新请求反馈');
    } catch (e) {
      if (mounted.current) toast(e instanceof Error ? e.message : '反馈失败，作文已保存在本机');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <button className="back-button" onClick={() => go('library')}>选择题目</button>
          <h1>写作练习</h1>
          <p>读清要求，写下自己的表达。草稿自动保存。</p>
        </div>
        <button className="secondary" onClick={() => addContent()}>
          添加写作题
        </button>
      </div>
      {!task ? (
        <Empty
          title="还没有写作题"
          detail="添加试卷或个人练习中的写作题，题目要求与来源会保留在这里。"
        />
      ) : (
        <>
          {rows.length > 1 && (
            <label className="writing-selector">
              选择题目
              <select
                aria-label="选择写作题"
                value={task.id}
                onChange={(e) => {
                  const p = rows.find((p) => p.id === e.target.value);
                  if (p) start(p);
                }}
              >
                {rows.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.exam} · {p.year} {p.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="writing-layout">
            <section className="panel writing-prompt">
              <span className="tag">
                <PenLine size={14} />
                {task.year} · {task.exam}
              </span>
              <ContentBadge passage={task} />
              <h2>{task.title}</h2>
              {task.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              <details>
                <summary>查看题目来源</summary>
                <p>{task.source}</p>
                <p>{task.provenance?.paper}</p>
                <p>{task.provenance?.reference}</p>
              </details>
              <SourceView passage={task} />
              <button
                className="text-link"
                onClick={() => setNote({ passageId: task.id, quote: task.title })}
              >
                <NotebookPen size={16} />
                记录写作思路
              </button>
            </section>
            <section className="panel writing-editor">
              <label htmlFor="essay">我的作文</label>
              <textarea
                id="essay"
                aria-label="我的作文"
                value={draft.text}
                maxLength={30000}
                rows={16}
                placeholder="在这里写下你的作文…"
                onChange={(e) => edit(e.target.value)}
              />
              <div className="row spread wrap">
                <span className="muted">
                  {draft.text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0} 词 · 自动保存
                </span>
                <button className="primary" onClick={review} disabled={busy || !draft.text.trim()}>
                  <Sparkles size={16} />
                  {busy ? '正在分析…' : 'AI 写作建议'}
                </button>
              </div>
              <button className="secondary coach-question-button" onClick={() => askCompanion('我想先理清这篇作文的思路，请结合题目和当前草稿给我一个小建议。','chat')}><MessageCircle size={16} />让陪练帮我理思路</button>
              <p className="small-text muted">
                点击分析才发送本题与作文；建议供参考，不提供官方评分。
              </p>
              {draft.feedback && (
                <div className="writing-feedback">
                  <h3>写作建议</h3>
                  <p>{draft.feedback}</p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
        <Companion
          small
          text="先列出观点和结构，再检查时态、拼写与衔接。"
          mood={busy ? 'thinking' : 'idle'}
        />
    </>
  );
}
