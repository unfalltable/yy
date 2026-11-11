import { useCallback, useEffect, useRef, useState } from 'react';
import { Hand, MessageCircle, Send, Settings2, Volume2, X, Sparkles, Target, Pause, Play } from 'lucide-react';
import { useStudy } from './context';
import { Mascot } from './Mascot';
import { speak, stopSpeech } from './speech';
import { IconButton } from './ui';
import { advanceCare, appendCompanionTurn, type CompanionTurn, type CareClock } from './companionCore';
import { acknowledgeSessionNotice, buildCoachPrompt, currentLearning, learningSummary, sessionNotice, type CompanionIntent, type CompanionRequest } from './companionCoach';
import { useCompanionSession } from './useCompanionSession';
import { formatTime, uid } from './core';
import type { Mood } from './VrmAvatar';
type CueProps = { welcome?: boolean; text?: string; mood?: Mood; small?: boolean };
export function CompanionCue({ text = '', mood = 'idle' }: CueProps) {
  const { cueCompanion } = useStudy();
  useEffect(() => { cueCompanion({ text, mood }); return () => cueCompanion({ text: '', mood: 'idle' }); }, [text,mood,cueCompanion]);
  return null;
}
const careLines = [
  '学了一阵了，喝口水、眺望一下远处吧。我会在这里等你。',
  '肩膀放松一点，别太绷着。今天也在一点点往前走呢。',
  '不用急着一口气做完，休息好再继续，我们按自己的节奏来。',
];
const summary = (value: string) => value.length > 180 ? value.slice(0,180) + '…（完整回答见对话）' : value;
export default function Companion({ text = '', mood = 'idle', request }: CueProps & { request?: CompanionRequest | null }) {
  const { state, update, toast, go, bank, current, page, begin } = useStudy();
  const turns = state.companionHistory;
  const [action,setAction] = useState<Mood | null>(null), [chat,setChat] = useState(false),
    [question,setQuestion] = useState(''), [intent,setIntent] = useState<CompanionIntent>('chat'),
    [includeContext,setIncludeContext] = useState(true), [busy,setBusy] = useState(false),
    [message,setMessage] = useState({ text:'', id:0 }), [visible,setVisible] = useState(false),
    [hovered,setHovered] = useState(false), [focused,setFocused] = useState(false), [speaking,setSpeaking] = useState(false),
    [focusOpen,setFocusOpen] = useState(false), [minutes,setMinutes] = useState(state.settings.dailyGoal),
    [failed,setFailed] = useState<{ question:string; intent:CompanionIntent } | null>(null);
  const mounted = useRef(true), busyRef = useRef(false), job = useRef(''),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), messagesRef = useRef<HTMLDivElement>(null),
    lastMessage = useRef(Date.now()), careIndex = useRef(0),
    careClock = useRef<CareClock>({ activeMs:0, lastTick:Date.now(), lastInput:Date.now() });
  const focus = useCompanionSession(state,update);
  const stats = learningSummary(state), learning = currentLearning(state,bank,current,page);
  const configured = Boolean(window.desktop && state.settings.aiEndpoint && state.settings.aiModel);
  const serviceLabel = /deepseek/i.test(state.settings.aiModel) ? 'DeepSeek' : 'AI';
  const lastAnswer = [...turns].reverse().find(turn => turn.role === 'assistant')?.text;
  const latest = useRef({ state,chat,busy,visible,speaking,mood,foreground:focus.foreground });
  latest.current = { state,chat,busy,visible,speaking,mood,foreground:focus.foreground };
  const goalNotified = useRef(stats.seconds !== null && stats.seconds >= stats.targetMinutes * 60 ? stats.day : '');
  const showMessage = useCallback((value: string) => {
    lastMessage.current = Date.now(); setMessage(previous => ({ text:value,id:previous.id+1 })); setVisible(true);
  },[]);
  function animate(next: Mood) { setAction(next); clearTimeout(timer.current); timer.current = setTimeout(() => setAction(null),3600); }
  useEffect(() => {
    mounted.current = true;
    showMessage('准备好了就出发吧，我会一直在这里陪着你。');
    const listener = (event: Event) => setSpeaking((event as CustomEvent<boolean>).detail);
    window.addEventListener('lingo-speech',listener);
    return () => {
      mounted.current = false; clearTimeout(timer.current); stopSpeech();
      if (job.current) void window.desktop?.cancelAi?.(job.current);
      window.removeEventListener('lingo-speech',listener);
    };
  },[showMessage]);
  useEffect(() => { if (text) showMessage(text); },[text,mood,showMessage]);
  useEffect(() => {
    if (!request) return;
    setChat(true); setQuestion(request.question); setIntent(request.intent); setIncludeContext(true);
  },[request]);
  useEffect(() => {
    if (!visible || busy || hovered || focused || speaking) return;
    const timeout = setTimeout(() => setVisible(false), Math.min(16000,Math.max(6000,message.text.length * 180)));
    return () => clearTimeout(timeout);
  },[message,visible,busy,hovered,focused,speaking]);
  useEffect(() => {
    const activity = () => { careClock.current.lastInput = Date.now(); };
    window.addEventListener('pointermove',activity,{ passive:true });
    window.addEventListener('keydown',activity); window.addEventListener('wheel',activity,{ passive:true });
    window.addEventListener('pointerdown',activity,{ passive:true });
    const interval = setInterval(() => {
      const now = Date.now(), live = latest.current;
      const editing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName ?? '') ||
        (document.activeElement as HTMLElement | null)?.isContentEditable;
      const canSpeak = live.foreground && !live.busy && !live.chat && !live.visible && !live.speaking &&
        live.mood !== 'thinking' && !editing && !document.querySelector('dialog[open],[role="dialog"]');
      const session = live.state.companionSession;
      const notice = session ? sessionNotice(session,live.state.settings.companionStyle) : null;
      if (session && notice && canSpeak && now - lastMessage.current >= 60000) {
        update(s => s.companionSession?.id === session.id ? {
          ...s,companionSession:acknowledgeSessionNotice(s.companionSession,notice.key),
        } : s);
        showMessage(notice.text); return;
      }
      if (!live.state.settings.companionCare) {
        careClock.current = { ...careClock.current,lastTick:now,activeMs:0 }; return;
      }
      const progress = learningSummary(live.state);
      if (canSpeak && now - lastMessage.current >= 5 * 60000 && progress.seconds !== null &&
        progress.seconds >= progress.targetMinutes * 60 && goalNotified.current !== progress.day) {
        goalNotified.current = progress.day;
        showMessage('今天设定的'+progress.targetMinutes+'分钟练习目标已经完成了。要不要把刚才最有用的一点记下来，然后安心休息？');
        return;
      }
      const next = advanceCare(careClock.current,now,!document.hidden && document.hasFocus(),
        canSpeak && now-lastMessage.current >= 5*60000);
      careClock.current = next.clock;
      if (next.due) showMessage(careLines[careIndex.current++ % careLines.length]);
    },30000);
    return () => {
      clearInterval(interval); window.removeEventListener('pointermove',activity);
      window.removeEventListener('keydown',activity); window.removeEventListener('wheel',activity); window.removeEventListener('pointerdown',activity);
    };
  },[showMessage,update]);
  useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; },[turns,chat,busy]);
  function addTurn(turn: CompanionTurn) { update(s => ({ ...s,companionHistory:appendCompanionTurn(s.companionHistory,turn) })); }
  function dismiss() { setVisible(false); setHovered(false); setFocused(false); stopSpeech(); }
  function wave() {
    const greeting = '嗨，我一直在呢！准备好了就一起出发吧。';
    animate('wave'); showMessage(greeting);
    if (state.settings.speech) speak(greeting,1,toast);
  }
  async function ask(value = question, purpose = intent) {
    const submitted = value.trim();
    if (!submitted || busyRef.current) return;
    setChat(true);
    if (!configured) {
      if (purpose === 'encourage') {
        const line = '不需要一下子做得很好。愿意回来学这一小段，就已经是一个开始。我们先读懂一句，或者只做一题，累了也可以休息。';
        addTurn({ role:'user',text:submitted }); addTurn({ role:'assistant',text:line,context:'本机鼓励' });
        showMessage(line); animate('encourage'); return;
      }
      setQuestion(submitted); toast('请先在设置中连接 DeepSeek 或其他 AI 服务'); go('settings'); return;
    }
    const id = uid();
    const label = includeContext ? learning.label : '未附带学习资料';
    const prompt = buildCoachPrompt({ state,bank,current,page,question:submitted,intent:purpose,includeContext });
    busyRef.current = true; job.current = id; setBusy(true); setFailed(null);
    addTurn({ role:'user',text:submitted,context:label });
    setQuestion(''); setIntent('chat'); showMessage('让我想一想…');
    try {
      const reply = await window.desktop!.ai({ endpoint:state.settings.aiEndpoint,model:state.settings.aiModel,prompt,requestId:id });
      if (!mounted.current || job.current !== id) return;
      addTurn({ role:'assistant',text:reply }); showMessage(summary(reply));
      animate(purpose === 'encourage' ? 'encourage' : 'happy');
      if (state.settings.speech) speak(reply,1,toast);
    } catch (e) {
      if (mounted.current && job.current === id) {
        const error = e instanceof Error ? e.message : 'AI 暂时无法连接';
        addTurn({ role:'error',text:error }); setFailed({ question:submitted,intent:purpose });
        showMessage('这次没有连上，问题还在。可以放回输入框后再试。'); toast(error);
      }
    } finally {
      if (mounted.current && job.current === id) { job.current=''; busyRef.current=false; setBusy(false); }
    }
  }
  function cancelAnswer() {
    const id = job.current; if (!id) return;
    job.current=''; busyRef.current=false; setBusy(false);
    void window.desktop?.cancelAi?.(id);
    addTurn({ role:'error',text:'本轮回答已停止，可以继续提问。' });
    showMessage('先停在这里也没关系，想继续时再问我就好。');
  }
  function startSession() {
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 180) return;
    update(s => ({ ...s,companionSession:{ id:uid(),startedAt:new Date().toISOString(),targetMinutes:minutes,
      activeSeconds:0,status:'running',notices:[] } }));
    setFocusOpen(true); animate('encourage');
    showMessage('好，我们先学'+minutes+'分钟。先把目标缩小到眼前的一题；卡住了就叫我，也可以随时暂停。');
    if (['home','settings','insights'].includes(page)) begin();
  }
  const session = focus.session;
  const inSession = session?.status === 'running' || session?.status === 'paused';
  return (
    <section className="study-companion companion-compact companion-floating" aria-label="3D 学习搭子">
      <div className="companion-stage">
        <Mascot settings={state.settings} small mood={busy ? 'thinking' : (action ?? mood)} />
        <button className="icon-button companion-settings" aria-label="更换角色" title="更换角色" onClick={() => go('settings')}><Settings2 size={16} /></button>
        {visible && <div className="companion-line"
          onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
          onKeyDown={e => { if (e.key === 'Escape') dismiss(); }}>
          <div className="companion-line-heading"><strong>{state.settings.companionName}</strong>
            <IconButton label="收起陪练气泡" onClick={dismiss}><X size={14} /></IconButton></div>
          <p role="status" aria-live="polite" aria-atomic="true">{message.text}</p>
        </div>}
      </div>
      <div className="companion-actions">
        <button onClick={wave} aria-label="向角色打招呼"><Hand size={16} aria-hidden="true" />打招呼</button>
        <button onClick={() => { showMessage(message.text); speak(lastAnswer || message.text,1,toast); }} aria-label="朗读陪练的话"><Volume2 size={16} aria-hidden="true" /><span>听她说</span></button>
        <button onClick={() => setChat(!chat)} aria-expanded={chat}><MessageCircle size={16} aria-hidden="true" />问陪练</button>
      </div>
      {chat && <div className="companion-chat coach-chat" aria-label="陪练对话">
        <div className="row spread coach-heading"><div><strong>和 {state.settings.companionName} 一起学</strong>
          <small>{configured ? serviceLabel+' 答疑 · AI陪练' : '学习搭子 · 可连接DeepSeek'}</small></div>
          <IconButton label="收起对话" onClick={() => setChat(false)}><X size={16} /></IconButton></div>
        <div className="coach-scroll">
        <div className="coach-tools">
          <button onClick={() => void ask('我有点学不动了，给我一点鼓励，帮我找到一个小小的下一步。','encourage')} disabled={busy}><Sparkles size={14} />鼓励一下</button>
          <button onClick={() => setFocusOpen(!focusOpen)} aria-expanded={focusOpen}><Target size={14} />专注陪学</button>
          <button onClick={() => void ask('根据我今天的学习情况，帮我安排接下来一个小目标。','plan')} disabled={busy}>下一步学什么</button>
        </div>
        <div className="coach-progress" aria-label="今日学习进度">
          <span>今日作答 {stats.answered} 次 · 答对 {stats.correct} 次</span>
          <small>{stats.seconds === null ? '学习计时未开启' : '练习 '+Math.floor(stats.seconds/60)+' / '+stats.targetMinutes+' 分钟'}</small>
        </div>
        {focusOpen && <section className="coach-session" aria-label="专注陪学">
          <div className="row spread"><strong>这一轮，慢慢来</strong><small>
            {session?.status === 'running' ? (focus.foreground ? '前台计时中' : '后台暂停计时') :
              session?.status === 'paused' ? '已暂停' : session?.status === 'completed' ? '本轮已完成' : session?.status === 'ended' ? '本轮已结束' : '选一个能做到的小目标'}
          </small></div>
          {session && <><div className="coach-clock" aria-label="本轮已陪学时长">{formatTime(Math.floor(session.activeSeconds))}<span> / {session.targetMinutes} 分钟</span></div>
            <progress aria-label="本轮专注进度" max={session.targetMinutes*60} value={session.activeSeconds} /></>}
          <div className="row wrap">
            {!inSession ? <><label>本轮目标 <select aria-label="本轮陪学目标" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
              {[...new Set([15,25,45,state.settings.dailyGoal])].sort((a,b) => a-b).map(n => <option key={n} value={n}>{n}分钟</option>)}
            </select></label><button className="primary small-button" onClick={startSession}>开始陪学</button></> : <>
              <button className="secondary small-button" onClick={() => focus.change(s => ({ ...s,status:s.status === 'running' ? 'paused' : 'running' }))}>
                {session?.status === 'running' ? <><Pause size={14} />暂停陪学</> : <><Play size={14} />继续陪学</>}
              </button>
              <button className="text-link" onClick={() => { focus.change(s => ({ ...s,status:'ended' })); showMessage('这段专注已经算数了。先休息也可以，记录会留在这里；准备好了再一起开始。'); }}>结束本轮</button>
            </>}
          </div>
          <p>只累计本应用前台时间；切出后台暂停，返回继续。重启后需手动继续。</p>
        </section>}
        <div className="companion-messages" role="log" aria-label="陪练对话记录" ref={messagesRef}>
          {turns.length === 0 && <p className="muted small-text">学习卡住了，或者只是想聊聊，都可以告诉我。</p>}
          {turns.map((turn,index) => <div key={index} className={'companion-turn '+turn.role}>
            <span>{turn.role === 'user' ? '你' : turn.role === 'error' ? '连接提醒' : state.settings.companionName}</span>
            {turn.context && <small>{turn.context}</small>}
            <p tabIndex={0} aria-label={turn.role === 'assistant' ? '陪练完整回答' : undefined}>{turn.text}</p>
          </div>)}
          {busy && <p className="muted small-text" role="status">正在想一想…</p>}
        </div>
        <div className="coach-context">
          <label><input type="checkbox" aria-label="结合当前学习内容" checked={includeContext} onChange={e => setIncludeContext(e.target.checked)} />结合当前学习内容</label>
          <small>{includeContext ? learning.label : '本次不附带题目、作文或学习统计；保留最近对话'}</small>
          {learning.passage && <div className="row wrap">
            <button className="text-link" disabled={busy} onClick={() => void ask('这道题先给我一个小提示，不要揭晓答案。','hint')}>先给个提示</button>
            <button className="text-link" disabled={busy} onClick={() => void ask(learning.passage?.kind === 'writing'
              ? '请看当前写作要求和我的草稿，指出一个最值得先改进的地方。'
              : '请讲解当前内容和题目，说明依据，必要时展开答案与选项分析。','explain')}>讲解与答案</button>
          </div>}
        </div>
        {failed && <button className="coach-retry" onClick={() => { setQuestion(failed.question); setIntent(failed.intent); setFailed(null); }}>把上次问题放回输入框</button>}
        {busy && <button className="text-link coach-cancel" onClick={cancelAnswer}>停止回答</button>}
        </div>
        <form onSubmit={e => { e.preventDefault(); void ask(); }}>
          <label className="sr-only" htmlFor="companion-question">问陪练的问题</label>
          <input id="companion-question" value={question} maxLength={2000} onChange={e => { setQuestion(e.target.value); setIntent('chat'); }}
            placeholder="题目、情绪、学习安排，都可以聊…" disabled={busy} />
          <button className="primary" type="submit" disabled={busy || !question.trim()} aria-label="发送问题"><Send size={17} /></button>
        </form>
      </div>}
    </section>
  );
}
