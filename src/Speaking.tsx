import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Headphones,
  Mic,
  Play,
  RotateCcw,
  Square,
  Volume2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useStudy } from './context';
import { alignWords } from './core';
import { speak, stopSpeech } from './speech';
import { CompanionCue as Companion } from './Companion';
export default function Speaking() {
  const { state, go, toast, bank, bankFilters } = useStudy();
  const sourceSentences = bank
    .filter((p) => bankFilters.exam === 'all' || p.exam === bankFilters.exam)
    .map((p) => ({
      id: p.id,
      title: p.exam + ' · ' + p.year + ' ' + p.title,
      text: p.paragraphs[0].split(/(?<=[.!?])\s+/)[0].slice(0, 1000),
    }));
  const [sentence, setSentence] = useState(''),
    [rate, setRate] = useState(0.9),
    [recording, setRecording] = useState(false),
    [audioUrl, setAudioUrl] = useState(''),
    [blob, setBlob] = useState<Blob | null>(null),
    [spoken, setSpoken] = useState(''),
    [busy, setBusy] = useState(false),
    [compared, setCompared] = useState(false),
    [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    url = useRef(''),
    timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      clearInterval(timer.current);
      if (url.current) URL.revokeObjectURL(url.current);
      stopSpeech();
    };
  }, []);
  async function begin() {
    if (!sentence.trim()) {
      toast('请先输入跟读文本');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast('当前环境不支持录音，请使用桌面应用');
      return;
    }
    try {
      const capture = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        capture.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = capture;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(capture, mime ? { mimeType: mime } : undefined);
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        capture.getTracks().forEach((t) => t.stop());
        clearInterval(timer.current);
        if (!mounted.current) return;
        const result = new Blob(chunks, { type: rec.mimeType.split(';')[0] });
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(result);
        setBlob(result);
        setAudioUrl(url.current);
        setRecording(false);
      };
      rec.onerror = () => {
        rec.stop();
        toast('录音失败，请检查麦克风权限');
      };
      rec.start();
      setSeconds(0);
      setRecording(true);
      setCompared(false);
      timer.current = setInterval(
        () =>
          setSeconds((s) => {
            if (s >= 59) {
              rec.stop();
              return 60;
            }
            return s + 1;
          }),
        1000,
      );
    } catch {
      toast('无法访问麦克风，请在 Windows 隐私设置中允许此应用录音');
    }
  }
  async function transcribe() {
    if (!blob) return;
    if (!window.desktop || !state.settings.aiEndpoint || !state.settings.asrModel) {
      toast('请先配置支持语音识别的服务地址和 ASR 模型');
      go('settings');
      return;
    }
    setBusy(true);
    try {
      const data = await new Promise<string>((res, rej) => {
        const f = new FileReader();
        f.onload = () => res((f.result as string).split(',')[1]);
        f.onerror = rej;
        f.readAsDataURL(blob);
      });
      const text = await window.desktop.transcribe({
        endpoint: state.settings.aiEndpoint,
        model: state.settings.asrModel,
        audio: data,
        mime: blob.type,
      });
      setSpoken(text);
      setCompared(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : '识别失败');
    } finally {
      setBusy(false);
    }
  }
  const alignment = alignWords(sentence, spoken);
  return (
    <>
      <div className="page-heading">
        <div className="greeting">听得清楚，也说得自然</div>
        <h1>让英语，开口说</h1>
        <p>
          {bankFilters.exam === '英一' || bankFilters.exam === '英二'
            ? '听说拓展练习，不属于考研英语初试科目。'
            : '听系统示范、录音、回放，再对照原文。'}
        </p>
      </div>
      <div className="speaking-layout">
        <section className="speaking-panel panel">
          <div className="row spread">
            <span className="tag violet">
              <Headphones size={14} />
              跟读练习
            </span>
            <label className="row muted">
              示范速度
              <select
                aria-label="示范速度"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              >
                {[0.7, 0.9, 1, 1.2].map((r) => (
                  <option key={r} value={r}>
                    {r} 倍速
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h2>先听一句，再跟着读</h2>
          <div className="sentence-choices">
            {sourceSentences.map((s) => (
              <button
                disabled={recording}
                className={sentence === s.text ? 'selected' : ''}
                key={s.id}
                onClick={() => {
                  setSentence(s.text);
                  setCompared(false);
                  setSpoken('');
                }}
              >
                {s.title}
              </button>
            ))}
          </div>
          {!sourceSentences.length && (
            <p className="callout">
              添加题目或文章后，可以选择其中的原句跟读，也可在下方直接粘贴。
            </p>
          )}
          <label className="field">
            跟读文本
            <textarea
              disabled={recording}
              value={sentence}
              placeholder="从题库选择句子，或粘贴自己的学习材料"
              maxLength={1000}
              rows={4}
              onChange={(e) => {
                setSentence(e.target.value);
                setCompared(false);
              }}
            />
          </label>
          <div className="row">
            <button
              className="secondary"
              disabled={recording || !sentence.trim()}
              onClick={() => speak(sentence, rate, toast)}
            >
              <Volume2 size={17} />
              听示范
            </button>
            <button
              className="primary"
              disabled={!sentence.trim() || busy}
              onClick={() => (recording ? recorder.current?.stop() : void begin())}
            >
              {recording ? <Square size={16} /> : <Mic size={17} />}
              {recording ? '结束录音 ' + seconds + 's' : '开始跟读录音'}
            </button>
            <button className="text-link" onClick={() => stopSpeech()}>
              停止朗读
            </button>
          </div>
          {recording && (
            <p className="recording-notice">
              <span />
              正在使用麦克风，最长 60 秒
            </p>
          )}
          {audioUrl && (
            <div className="recording-result">
              <div className="row spread">
                <strong>听听自己的表达</strong>
                <span className="muted">录音仅在本次页面中保留</span>
              </div>
              <audio src={audioUrl} controls />
              <button className="secondary" disabled={busy || recording} onClick={transcribe}>
                <Sparkles size={16} />
                {busy ? '正在识别…' : '识别录音并对照文本'}
              </button>
              <p className="muted small-text">点击识别时，才会把录音发送到你配置的语音服务。</p>
            </div>
          )}
          <div className="transcript-section">
            <h3>对照表达，找到遗漏</h3>
            <label className="field">
              识别文本 / 手动练习记录
              <textarea
                rows={3}
                maxLength={1000}
                value={spoken}
                onChange={(e) => {
                  setSpoken(e.target.value);
                  setCompared(false);
                }}
                placeholder="配置语音服务后自动识别；也可以输入自己实际读出的内容进行文字对照。"
              />
            </label>
            <button
              className="secondary"
              disabled={!spoken.trim()}
              onClick={() => setCompared(true)}
            >
              对照文本
              <ArrowRight size={15} />
            </button>
            {compared && (
              <div className="alignment-result">
                <div className="row spread">
                  <strong>参考词覆盖率 {alignment.coverage}%</strong>
                  <span>文字对照结果</span>
                </div>
                <div>
                  {alignment.words.map((w, i) => (
                    <span key={i} className={w.matched ? 'matched' : 'missed'}>
                      {w.word}
                      {w.matched ? '' : '（待核对）'}{' '}
                    </span>
                  ))}
                </div>
                <p>
                  标记未匹配的词，可重听示范，留意重音、词尾和连读。识别误差也可能造成遗漏；此结果不衡量音素、重音或口音。
                </p>
              </div>
            )}
          </div>
        </section>
        <aside>
            <Companion
              small
              mood={recording || busy ? 'thinking' : compared ? 'happy' : 'idle'}
              text={recording ? '正在录音，跟着自己的节奏读。' : '先听节奏，再模仿重音和连读。'}
            />

          <div className="callout">
            本版支持系统朗读、录音和文本对照。专业发音纠错、音素评分尚未接入。
          </div>
          <button className="resource-link" onClick={() => go('library')}>
            <div>
              <strong>也来一篇听力练习</strong>
              <p>将声音放回真实语境</p>
            </div>
            <Headphones size={23} />
          </button>
        </aside>
      </div>
    </>
  );
}
