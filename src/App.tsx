import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  NotebookPen,
  ChartNoAxesCombined,
  Settings2,
  Bookmark,
  RotateCcw,
  Minus,
  Square,
  X,
  Check,
  Download,
  ArrowLeft,
  Menu,
  Headphones,
  Mic,
  PenLine,
  SlidersHorizontal,
} from 'lucide-react';
import { get } from 'idb-keyval';
import { useAppState, exportJson, flushStorage } from './storage';
import { Study } from './context';
import { passages, examNames } from './data';
import { uid } from './core';
import type { Page, Passage, Skill } from './types';
import { Modal, IconButton, Empty } from './ui';
import { Library, Mistakes, Notes, Words, Insights } from './pages';
import FocusHome from './FocusHome';
import Practice from './Practice';
import Speaking from './Speaking';
import Writing from './Writing';
import Settings from './Settings';
import Importer from './Importer';
import Article from './Article';
import Companion from './Companion';
import type { Mood } from './VrmAvatar';
import { defaultBankFilters, filterBank, type BankFilters } from './bankFilters';
import type { CompanionRequest } from './companionCoach';

const labels: Record<Page, string> = {
  home: '开始学习',
  library: '我的题库',
  practice: '做题',
  mistakes: '错题回顾',
  notes: '我的笔记',
  words: '生词本',
  speaking: '听说练习',
  writing: '写作练习',
  article: '文章精读',
  insights: '学习报告',
  settings: '设置与角色',
};
const records: [Page, typeof BookOpen][] = [
  ['mistakes', RotateCcw],
  ['notes', NotebookPen],
  ['words', Bookmark],
  ['insights', ChartNoAxesCombined],
  ['settings', Settings2],
];
export default function App() {
  const { state, update, ready, error } = useAppState();
  const [page, setPage] = useState<Page>('home'),
    [current, setCurrent] = useState(''),
    [message, setMessage] = useState('');
  const [picking, setPicking] = useState(false),
    [bankFilters, setBankFilters] = useState<BankFilters>({ ...defaultBankFilters }),
    [more, setMore] = useState(false),
    [skill, changeSkill] = useState<Skill>('reading'),
    [autoStart, setAutoStart] = useState(false);
  const [note, setNote] = useState<{
      passageId: string;
      quote: string;
      body?: string;
      id?: string;
      paragraph?: number;
    } | null>(null),
    [body, setBody] = useState('');
  const [companionCue, setCompanionCue] = useState<{ text: string; mood: Mood }>({ text: '', mood: 'idle' });
  const [companionRequest, setCompanionRequest] = useState<CompanionRequest | null>(null);
  const [importing, setImporting] = useState<{ seed?: Passage } | null>(null);
  const messageTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bank = [...passages, ...state.customPassages],
    activePassage = bank.find((p) => p.id === current);
  function toast(text: string) {
    setMessage(text);
    clearTimeout(messageTimeout.current);
    messageTimeout.current = setTimeout(() => setMessage(''), 4200);
  }
  function go(next: Page) {
    setMore(false);
    setPicking(false);
    setPage(next);
    setAutoStart(false);
  }
  function start(p: Passage, retry = false) {
    setPicking(false);
    setCurrent(p.id);
    changeSkill(p.kind === 'article' ? 'reading' : p.kind);
    if (p.kind === 'article') {
      setPage('article');
      return;
    }
    setAutoStart(false);
    if (p.kind === 'writing') {
      setPage('writing');
      return;
    }
    if (retry || !state.drafts[p.id])
      update((s) => ({
        ...s,
        drafts: {
          ...s.drafts,
          [p.id]: {
            answers: {},
            hints: {},
            seconds: 0,
            index: 0,
            finished: false,
            checked: [],
            times: {},
          },
        },
      }));
    setPage('practice');
  }
  function openSkill(next: Skill) {
    changeSkill(next);
    setPicking(false);
    setAutoStart(false);
    if (next === 'speaking') {
      setPage('speaking');
      return;
    }
    const rows = filterBank(bank, state, bankFilters, next);
    const p = rows.find(p => p.id === current) ??
      rows.find(p => state.drafts[p.id] && !state.drafts[p.id].finished) ?? rows[0];
    if (next === 'writing') {
      setCurrent(p?.id ?? '');
      setPage('writing');
    } else if (page !== 'library' && p) start(p);
    else {
      setCurrent('');
      setPage('library');
    }
  }
  function begin() {
    setMore(false);
    setPicking(false);
    changeSkill('reading');
    setAutoStart(true);
    setPage('library');
  }
  useEffect(() => {
    if (!more) return;
    const opener = document.querySelector('.header-records') as HTMLButtonElement | null;
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>('.records-menu button'));
    items[0]?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMore(false);
        opener?.focus();
      }
      if (e.key === 'Tab') {
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [more]);
  useEffect(() => {
    setBody(note?.body ?? '');
  }, [note]);
  useEffect(() => () => clearTimeout(messageTimeout.current), []);
  useEffect(() => window.desktop?.onBeforeClose?.(() => {
    void flushStorage().then(() => window.desktop?.closeReady?.());
  }), []);
  if (!ready)
    return (
      <div className="startup">
        <BookOpen size={36} />
        <h1>Lingo 伴学</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="primary"
              onClick={async () => {
                await exportJson('lingo-recovery.json', await get('lingo-state-v1'));
              }}
            >
              导出原始数据
            </button>
          </>
        ) : (
          <p>正在打开学习空间…</p>
        )}
      </div>
    );
  const learning = ['library', 'practice', 'speaking', 'writing', 'article'].includes(page);
  const displayedExam = ['practice','writing','article'].includes(page) ? activePassage?.exam : undefined;
  const examScope = displayedExam ?? bankFilters.exam;
  const postgraduate = examScope === '英一' || examScope === '英二';
  return (
    <Study.Provider
      value={{
        state,
        page,
        askCompanion: (question = '', intent = 'chat') => setCompanionRequest({ id: uid(), question, intent }),
        cueCompanion: setCompanionCue,
        update,
        go,
        start,
        begin,
        bankFilters,
        setBankFilters,
        bank,
        toast,
        setNote,
        skill,
        setSkill: openSkill,
        current,
        autoStart,
        addContent: (seed) => setImporting({ seed }),
      }}
    >
      <div className={'app focus-app' + (window.desktop?.nativeWindowControls ? ' native-window-controls' : '')}>
        <div className="workspace">
          <header className="titlebar focus-titlebar">
            <div className="row">
              <button className="focus-brand" onClick={() => go('home')} aria-label="Lingo 首页">
                <BookOpen size={22} />
                <strong>
                  Lingo <span>伴学</span>
                </strong>
              </button>
              {page !== 'home' && (
                <>
                  <span className="title-divider" />
                  <span className="exam-scope">{examScope === 'all' ? '全部考试' : examNames[examScope]}</span>
                </>
              )}
            </div>
            <div className="row titlebar-right">
              <button
                className="header-records"
                onClick={() => setMore(!more)}
                aria-expanded={more}
              >
                <Menu size={17} />
                学习记录与设置
              </button>
              {window.desktop && !window.desktop.nativeWindowControls && (
                <div className="window-controls">
                  <IconButton label="最小化" onClick={() => window.desktop?.minimize()}>
                    <Minus size={15} />
                  </IconButton>
                  <IconButton label="最大化或还原" onClick={() => window.desktop?.maximize()}>
                    <Square size={13} />
                  </IconButton>
                  <IconButton
                    label="关闭应用"
                    onClick={() => {
                      void flushStorage().then(() => window.desktop?.close());
                    }}
                  >
                    <X size={17} />
                  </IconButton>
                </div>
              )}
            </div>
          </header>
          {more && (
            <div className="records-overlay" onClick={() => setMore(false)}>
              <nav
                className="records-menu"
                aria-label="学习记录与设置"
                onClick={(e) => e.stopPropagation()}
              >
                {records.map(([id, Icon]) => (
                  <button key={id} onClick={() => go(id)}>
                    <Icon size={18} />
                    {labels[id]}
                  </button>
                ))}
              </nav>
            </div>
          )}
          {error && (
            <div className="storage-error" role="alert">
              {error}
              <button onClick={() => exportJson('lingo-emergency-backup.json', state)}>
                <Download size={16} />
                导出备份
              </button>
            </div>
          )}
          {learning && (
            <div className="learning-bar">
              <nav aria-label="学习方式">
                {(
                  [
                    ['reading', BookOpen, '阅读'],
                    ['writing', PenLine, '写作'],
                    ['listening', Headphones, postgraduate ? '听力拓展' : '听力'],
                    ['speaking', Mic, postgraduate ? '口语拓展' : '口语'],
                  ] as const
                ).map(([id, Icon, label]) => (
                  <button
                    key={id}
                    aria-current={skill === id ? 'page' : undefined}
                    className={skill === id ? 'selected' : ''}
                    onClick={() => openSkill(id)}
                  >
                    <Icon size={17} />
                    {label}
                  </button>
                ))}
              </nav>
              <button
                className="paper-picker"
                onClick={() => {
                  if (page === 'library') document.getElementById('bank-exam-filter')?.focus();
                  else setPicking(true);
                }}
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                筛选 / 换题
              </button>
            </div>
          )}
          <main className={'main-content page-' + page}>
            {page !== 'home' && !learning && (
              <button className="back-to-study" onClick={begin}>
                <ArrowLeft size={16} />
                返回学习
              </button>
            )}
            {page === 'home' && <FocusHome />}
            {page === 'library' && <Library />}
            {page === 'practice' &&
              (activePassage && activePassage.kind !== 'writing' ? (
                <Practice key={current} passage={activePassage} />
              ) : (
                <Empty
                  title="当前没有可练习的内容"
                  detail="添加自己的题目或文章，整理后即可开始。"
                  action={
                    <button className="primary" onClick={() => go('library')}>
                      添加题目
                    </button>
                  }
                />
              ))}
            {page === 'article' && activePassage && <Article passage={activePassage} />}
            {page === 'writing' && <Writing />}
            {page === 'speaking' && <Speaking />}
            {page === 'mistakes' && <Mistakes />}
            {page === 'notes' && <Notes />}
            {page === 'words' && <Words />}
            {page === 'insights' && <Insights />}
            {page === 'settings' && <Settings />}
          </main>
        </div>
        <Companion text={companionCue.text} mood={companionCue.mood} request={companionRequest} />
        {importing && <Importer seed={importing.seed} onClose={() => setImporting(null)} />}
        {picking && (
          <Modal title="筛选与选择题目" wide onClose={() => setPicking(false)}>
            <Library picker />
          </Modal>
        )}
        {message && (
          <div className="toast" role="status">
            <Check size={18} />
            {message}
          </div>
        )}
        {note && (
          <Modal title={note.id ? '编辑笔记' : '记下这一刻的理解'} onClose={() => setNote(null)}>
            <div className="note-source">{bank.find((p) => p.id === note.passageId)?.title}</div>
            {note.quote && <blockquote>{note.quote}</blockquote>}
            <label className="field">
              我的笔记
              <textarea
                autoFocus
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="写下词义、解题思路，或者突然想明白的地方…"
                rows={6}
                maxLength={20000}
              />
            </label>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setNote(null)}>
                取消
              </button>
              <button
                className="primary"
                disabled={!body.trim()}
                onClick={() => {
                  update((s) => ({
                    ...s,
                    notes: note.id
                      ? s.notes.map((n) => (n.id === note.id ? { ...n, body: body.trim() } : n))
                      : [
                          {
                            id: uid(),
                            passageId: note.passageId,
                            quote: note.quote,
                            body: body.trim(),
                            paragraph: note.paragraph,
                            at: new Date().toISOString(),
                          },
                          ...s.notes,
                        ],
                  }));
                  toast('笔记已保存');
                  setNote(null);
                }}
              >
                <NotebookPen size={16} />
                保存笔记
              </button>
            </div>
          </Modal>
        )}
      </div>
    </Study.Provider>
  );
}
