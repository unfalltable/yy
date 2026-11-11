import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, FileText, Sparkles, ArrowRight, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useStudy } from './context';
import { Modal } from './ui';
import { examNames } from './data';
import { uid } from './core';
import { dedupePassages, matchingMaterialIds } from './dedup';
import { readDocuments } from './documents';
import {
  buildImportPrompt,
  prepareCandidateMetadata,
  resolveSourceMetadata,
  candidateProblems,
  parseImportResponse,
  toPassages,
  materialBytes,
  examRules,
  importLimits as limits,
  validateMaterialBatch,
  type Candidate,
  type ImportMode,
  type OriginKind,
} from './importCore';
import type { Exam, Passage, SourceMaterial } from './types';

export default function Importer({ onClose, seed }: { onClose: () => void; seed?: Passage }) {
  const { state, update, start, toast, bankFilters } = useStudy();
  const existing = seed?.materialId
    ? state.materials.find((m) => m.id === seed.materialId)
    : undefined;
  const [mode, setMode] = useState<ImportMode>(seed ? 'generate' : 'extract');
  const [input, setInput] = useState<'file' | 'text'>(seed ? 'text' : 'file');
  const [files, setFiles] = useState<File[]>([]),
    [pasted, setPasted] = useState(seed?.paragraphs.join('\n\n') ?? '');
  const [range, setRange] = useState(''),
    [material, setMaterial] = useState<SourceMaterial | null>(null);
  const [exam, setExam] = useState<Exam>(seed?.exam ?? (bankFilters.exam === 'all' ? state.settings.exam : bankFilters.exam)),
    [origin, setOrigin] = useState<OriginKind>('practice');
  const [year, setYear] = useState(''),
    [paper, setPaper] = useState(''),
    [reference, setReference] = useState('');
  const [adapt, setAdapt] = useState(true),
    [supplement, setSupplement] = useState(true),
    [sendImages, setSendImages] = useState(true);
  const [step, setStep] = useState<'source' | 'review'>('source'),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]),
    [items, setItems] = useState<Candidate[]>([]),
    [active, setActive] = useState(0),
    [reviewed, setReviewed] = useState(false);
  const [duplicateMaterialIds,setDuplicateMaterialIds] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null),
    job = useRef(''),
    mounted = useRef(true),
    saved = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (job.current) void window.desktop?.cancelAi(job.current);
    };
  }, []);
  function cancel() {
    controller.current?.abort();
    if (job.current) void window.desktop?.cancelAi(job.current);
    setBusy(false);
    setStatus('已取消，原题库没有改变');
  }
  function invalidate() {
    setMaterial(null);
    setDuplicateMaterialIds([]);
    setError('');
    setWarnings([]);
    setStatus('');
  }
  async function read() {
    setError('');
    setBusy(true);
    setStatus('正在读取资料…');
    const ctl = new AbortController();
    controller.current = ctl;
    try {
      let result;
      if (input === 'text') {
        if (!pasted.trim()) throw Error('请粘贴文章或已有题目');
        if (pasted.length > limits.textChars) throw Error(`每批最多${limits.textChars / 10000}万字符，请按篇拆分`);
        result = {
          material: {
            id: uid(),
            name: seed?.title ?? '粘贴的学习资料',
            text: pasted.trim(),
            images: existing?.images ?? [],
            format: existing?.format,
            at: new Date().toISOString(),
          },
          warnings: [],
        };
      } else
        result = await readDocuments(files, range, ctl.signal, (s) => {
          if (mounted.current) setStatus(s);
        });
      if (!mounted.current || ctl.signal.aborted) return;
      setStatus('正在检查重复资料…');
      const checked = await matchingMaterialIds(result.material,state.materials,ctl.signal);
      if (!mounted.current || ctl.signal.aborted) return;
      setMaterial({...result.material,contentHash:checked.fingerprint});
      setDuplicateMaterialIds(checked.ids);
      setWarnings(result.warnings);
      setStatus('资料已在本机整理好');
    } catch (e) {
      if (mounted.current && !ctl.signal.aborted) {
        setError(e instanceof Error ? e.message : '读取失败，请检查文件');
        setStatus('读取未完成，尚未调用AI；请调整资料后重试');
      }
    } finally {
      if (mounted.current && !ctl.signal.aborted) setBusy(false);
    }
  }
  const processedRows = mode === 'extract' ? state.customPassages.filter(p =>
    p.exam === exam && p.kind !== 'article' && p.provenance?.kind !== 'ai-generated' &&
    p.materialId && duplicateMaterialIds.includes(p.materialId)) : [];
  async function analyze(force = false) {
    if (!material) return;
    try {
      validateMaterialBatch(material);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (
      !window.desktop ||
      !state.settings.aiEndpoint ||
      !(state.settings.aiModel || state.settings.visionModel)
    ) {
      setError('请先在「设置与角色 → AI与语音服务」配置服务地址和模型；资料尚未发送');
      return;
    }
    const images = sendImages ? material.images.map((i) => i.url) : [];
    if (!images.length && material.text.replace(/\[第\d+页\]/g, '').trim().length < 5) {
      setError('没有可用文字，请启用图片识别');
      return;
    }
    const model = images.length
      ? state.settings.visionModel || state.settings.aiModel
      : state.settings.aiModel;
    if (!model) {
      setError('请配置对话模型');
      return;
    }
    setBusy(true);
    setError('');
    setStatus(
      images.length
        ? 'AI正在识别图片并整理内容…'
        : mode === 'generate'
          ? 'AI正在按目标考试出题…'
          : 'AI正在提取原题…',
    );
    const id = uid(),
      ctl = new AbortController();
    job.current = id;
    controller.current = ctl;
    try {
      const checked = await matchingMaterialIds(material,state.materials,ctl.signal);
      if (!mounted.current || ctl.signal.aborted) return;
      setDuplicateMaterialIds(checked.ids);
      setMaterial({...material,contentHash:checked.fingerprint});
      const already = mode === 'extract' ? state.customPassages.filter(p => p.exam === exam && p.kind !== 'article' && p.provenance?.kind !== 'ai-generated' && p.materialId && checked.ids.includes(p.materialId)) : [];
      if (already.length && !force) {
        setStatus('这批资料已处理过；可打开已有内容，或选择重新解析并去重。尚未调用AI');
        return;
      }
      const response = await window.desktop.ai({
        endpoint: state.settings.aiEndpoint,
        model,
        prompt: buildImportPrompt(mode, exam, material, adapt, supplement),
        images,
        materialFormat: material.format,
        task: 'bank-import',
        requestId: id,
      });
      if (!mounted.current || ctl.signal.aborted) return;
      const parsed = parseImportResponse(response);
      setItems(
        parsed.items.map((p) =>
          mode === 'generate'
            ? {
                ...prepareCandidateMetadata(p,{year,paper,reference}),
                questions: p.questions.map((q) => ({
                  ...q,
                  answerBasis: q.answer === null ? 'unconfirmed' : 'ai',
                })),
              }
            : prepareCandidateMetadata(p,{year,paper,reference}),
        ),
      );
      setWarnings((prev) => [...new Set([...prev, ...parsed.warnings])]);
      setActive(0);
      setReviewed(false);
      setStep('review');
      setStatus('AI整理完成，请核对后入库');
    } catch (e) {
      if (mounted.current && !ctl.signal.aborted) {
        setStatus('AI处理未完成，题库未改变');
        setError(
          (e instanceof Error ? e.message : 'AI处理失败') +
            (material.images.length ? '；请确认模型支持图片识别，也可缩小页码重试。' : ''),
        );
      }
    } finally {
      if (job.current === id) job.current = '';
      if (mounted.current && !ctl.signal.aborted) setBusy(false);
    }
  }
  function patchItem(fn: (p: Candidate) => Candidate) {
    setItems((rows) => rows.map((p, i) => (i === active ? fn(p) : p)));
    setReviewed(false);
  }
  function patchQuestion(
    n: number,
    fn: (q: Candidate['questions'][number]) => Candidate['questions'][number],
  ) {
    patchItem((p) => ({ ...p, questions: p.questions.map((q, i) => (i === n ? fn(q) : q)) }));
  }
  function save() {
    if (!material || !reviewed || saved.current) return;
    try {
      const selectedOrigin = mode === 'generate' ? 'ai-generated' : origin;
      const incoming = toPassages(items, {
        mode,
        exam,
        origin: selectedOrigin,
        year,
        paper,
        reference,
        adapted: adapt,
        materialId: material.id,
        materialName: material.name,
      });
      const reused = state.materials.find(m=>duplicateMaterialIds.includes(m.id));
      const targetMaterial = reused ?? material;
      const rows = incoming.map(p=>({...p,materialId:targetMaterial.id}));
      const plan = dedupePassages(state.customPassages,rows,[],[...state.materials,...(!reused ? [material] : [])]);
      if (!plan.added.length) {
        saved.current = true;
        onClose();
        toast('全部已存在，已跳过 '+plan.skipped+' 篇内容、'+plan.skippedQuestions+' 道重复题，未重复入库');
        if (plan.firstMatch) start(plan.firstMatch);
        return;
      }
      if (state.customPassages.length + plan.added.length > 500)
        throw Error('题库最多500篇，请先整理不需要的内容');
      if (!reused && state.materials.length >= 200) throw Error('资料数量已达200份，请先删除不需要的内容');
      if (!reused && materialBytes([...state.materials,material]) > 120000000)
        throw Error('学习资料图片空间已达120MB，请先整理不需要的内容');
      saved.current = true;
      update(s=>({
        ...s,
        customPassages:[...s.customPassages,...plan.added],
        materials:reused ? s.materials : [...s.materials,material],
        settings:{...s.settings,exam},
      }));
      onClose();
      toast('已加入 '+plan.added.length+' 篇、'+plan.addedQuestions+' 题；跳过 '+plan.skippedQuestions+' 道重复题');
      start(plan.added[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '入库失败，原题库未改变');
    }
  }
  const duplicatePlan = useMemo(() => {
    if (step !== 'review' || !material) return null;
    try {
      const incoming = toPassages(items,{mode,exam,origin,year,paper,reference,adapted:adapt,materialId:material.id,materialName:material.name});
      const reused=state.materials.find(m=>duplicateMaterialIds.includes(m.id));
      return dedupePassages(state.customPassages,incoming.map(p=>({...p,materialId:reused?.id ?? material.id})),[],[...state.materials,...(!reused ? [material] : [])]);
    } catch { return null; }
  },[step,material,items,mode,exam,origin,year,paper,reference,adapt,state.customPassages,state.materials,duplicateMaterialIds]);
  const selected = items[active],
    selectedMetadata = selected ? resolveSourceMetadata(selected) : null,
    problems = step === 'review' ? candidateProblems(items, mode) : [];
  return (
    <Modal title={step === 'source' ? '添加到我的题库' : '核对题目并入库'} onClose={onClose} wide>
      <div className="import-progress">
        <span className={step === 'source' ? 'current' : ''}>1 选择资料</span>
        <ArrowRight size={14} />
        <span className={step === 'review' ? 'current' : ''}>2 核对入库</span>
      </div>
      {step === 'source' ? (
        <div className="import-source">
          <div className="import-mode" role="group" aria-label="处理方式">
            <button
              disabled={busy}
              className={mode === 'extract' ? 'selected' : ''}
              aria-pressed={mode === 'extract'}
              onClick={() => setMode('extract')}
            >
              <FileText size={22} />
              <strong>提取已有题目</strong>
              <span>真题、自购模拟题、网上找到的练习</span>
            </button>
            <button
              disabled={busy}
              className={mode === 'generate' ? 'selected' : ''}
              aria-pressed={mode === 'generate'}
              onClick={() => setMode('generate')}
            >
              <Sparkles size={22} />
              <strong>文章 AI 出题</strong>
              <span>从文章或短文创建专属阅读练习</span>
            </button>
          </div>
          <div className="import-options">
            <label>
              目标考试
              <select
                aria-label="导入目标考试"
                disabled={busy}
                value={exam}
                onChange={(e) => setExam(e.target.value as Exam)}
              >
                {(Object.keys(examNames) as Exam[]).map((e) => (
                  <option key={e} value={e}>
                    {examNames[e]}
                  </option>
                ))}
              </select>
            </label>
            {mode === 'extract' && (
              <label>
                资料类别
                <select
                  aria-label="资料类别"
                  disabled={busy}
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value as OriginKind)}
                >
                  <option value="practice">个人练习 / 模拟题</option>
                  <option value="past-paper">历年真题</option>
                  <option value="article">学习文章</option>
                </select>
              </label>
            )}
          </div>
          {mode === 'generate' && (
            <div className="generation-rules">
              <strong>{examRules[exam].title}</strong>
              <p>{examRules[exam].focus}</p>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={adapt}
                  disabled={busy}
                  onChange={(e) => setAdapt(e.target.checked)}
                />
                允许 AI 改写文章以调整难度和篇幅（会明确标记）
              </label>
            </div>
          )}
          {mode === 'extract' && (
            <label className="check-line">
              <input
                type="checkbox"
                checked={supplement}
                disabled={busy}
                onChange={(e) => setSupplement(e.target.checked)}
              />
              允许 AI 补全缺失的答案与解析，并标记为 AI 补全
            </label>
          )}
          {(mode === 'generate' || origin !== 'past-paper') && (
            <details className="optional-source">
              <summary>补充资料名称与出处（可选）</summary>
              <label className="field">
                资料名称
                <input
                  value={paper}
                  maxLength={300}
                  onChange={(e) => setPaper(e.target.value)}
                  placeholder="例如购买的练习册名称"
                />
              </label>
              <label className="field">
                出处或网址
                <input
                  value={reference}
                  maxLength={800}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="书名、页码或原文章网址"
                />
              </label>
            </details>
          )}
          <div className="segmented input-method" role="group" aria-label="资料输入方式">
            <button
              disabled={busy}
              className={input === 'file' ? 'selected' : ''}
              onClick={() => {
                setInput('file');
                invalidate();
              }}
            >
              上传文件
            </button>
            <button
              disabled={busy}
              className={input === 'text' ? 'selected' : ''}
              onClick={() => {
                setInput('text');
                invalidate();
              }}
            >
              粘贴文章 / 题目
            </button>
          </div>
          {input === 'file' ? (
            <>
              <label className={'document-drop ' + (busy ? 'disabled' : '')}>
                <FileUp size={28} />
                <strong>
                  {files.length
                    ? files.map((f) => f.name).join('、')
                    : '选择照片、PDF、Word 或文本'}
                </strong>
                <span>DOC / DOCX / PDF / TXT / MD / JPG / PNG / WebP / BMP / GIF</span>
                <input
                  aria-label="选择学习资料"
                  type="file"
                  multiple
                  disabled={busy}
                  accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.bmp,.gif"
                  onChange={(e) => {
                    setFiles(Array.from(e.target.files ?? []));
                    invalidate();
                  }}
                />
              </label>
              <p className="small-text muted">
                文档一次1份；单文件与本批总计20MB以内，照片一次最多6张。PDF每批最多{limits.pdfPages}页，每批正文最多{limits.textChars / 10000}万字符。超过限制请分批上传，不会自动继续调用AI。
              </p>
              {files.some((f) => /\.pdf$/i.test(f.name)) && (
                <label className="field">
                  PDF页码范围
                  <input
                    aria-label="PDF页码范围"
                    disabled={busy}
                    value={range}
                    onChange={(e) => {
                      setRange(e.target.value);
                      invalidate();
                    }}
                    placeholder={`例如 1-3,5；留空读取前${limits.pdfPages}页`}
                  />
                </label>
              )}
            </>
          ) : (
            <label className="field">
              文章或已有题目
              <textarea
                aria-label="待处理文章"
                rows={8}
                value={pasted}
                disabled={busy}
                placeholder="粘贴你要精读的文章、短文或已有题目…"
                onChange={(e) => {
                  setPasted(e.target.value);
                  invalidate();
                }}
              />
            </label>
          )}
          <div className="row wrap">
            <button
              className={material ? 'secondary' : 'primary'}
              disabled={busy || (input === 'file' ? !files.length : !pasted.trim())}
              onClick={read}
            >
              <FileText size={16} />
              {material ? '重新读取资料' : '读取资料'}
            </button>
            {material && (
              <span className="muted small-text">
                已读取 {material.text.length} 字符、{material.images.length} 张图片
              </span>
            )}
          </div>
          {material && (
            <div className="material-ready">
              <details>
                <summary>查看本批资料：{material.name}</summary>
                {material.images.length > 0 && (
                  <div className="source-thumbnails">
                    {material.images.map((i, n) => (
                      <figure key={n}>
                        <img src={i.url} alt={i.name} />
                        <figcaption>{i.name}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                <label className="field">
                  识别前的文字（可修正）
                  <textarea
                    rows={7}
                    value={material.text}
                    disabled={busy}
                    onChange={(e) => { setMaterial({ ...material, text:e.target.value,contentHash:undefined }); setDuplicateMaterialIds([]); }}
                  />
                </label>
              </details>
            </div>
          )}
          {origin === 'past-paper' && mode === 'extract' && (
            <div>
            <p className="small-text muted">年份、试卷名称和出处均为可选；AI 根据资料识别，无法确认也可入库并标记待核实。</p>
            <div className="import-source-fields">
              <label className="field">
                考试年份（可选）
                <input
                  aria-label="真题年份"
                  value={year}
                  maxLength={4}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="留空由 AI 识别"
                />
              </label>
              <label className="field">
                原始试卷名称（可选）
                <input
                  aria-label="原始试卷名称"
                  placeholder="留空由 AI 识别"
                  value={paper}
                  maxLength={300}
                  onChange={(e) => setPaper(e.target.value)}
                />
              </label>
              <label className="field">
                原始出处（可选）
                <input
                  aria-label="原始出处"
                  value={reference}
                  maxLength={800}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="可留空；AI 仅记录资料中可识别的出处"
                />
              </label>
            </div>
            </div>
          )}
          {material && material.images.length > 0 && (
            <label className="check-line">
              <input
                type="checkbox"
                checked={sendImages}
                disabled={busy}
                onChange={(e) => setSendImages(e.target.checked)}
              />
              同时识别本批图片（照片、扫描页需启用；要求模型支持图片）
            </label>
          )}
          {material && (
            <div className="import-ai-action">
              <p>
                点击下方按钮，会将本批文字与图片发送到你配置的 AI
                服务。每次只处理本批，不自动续批或重试。结果先预览，确认后才入库。
              </p>
              {material.text.trim() && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setMode('extract');
                    setOrigin('article');
                    setItems([
                      {
                        title: material.name,
                        kind: 'article',
                        paragraphs: material.text.split(/\n\s*\n/).filter(Boolean),
                        questions: [],
                        sourceLocator: '原文件正文',
                      },
                    ]);
                    setActive(0);
                    setReviewed(false);
                    setStep('review');
                  }}
                >
                  先保存为精读文章
                </button>
              )}
              {processedRows.length > 0 && <div className="duplicate-notice" role="status" aria-label="重复资料提醒">
                <strong>这批资料已入库</strong>
                <p>已有 {processedRows.length} 篇内容。可直接打开；需要补提漏题时也能重新解析，入库会自动跳过重复题。</p>
                <button className="primary" disabled={busy} onClick={()=>{onClose();start(processedRows[0]);}}>打开已有内容</button>
                <button className="secondary" disabled={busy} onClick={()=>void analyze(true)}>重新解析并去重</button>
              </div>}
              {!processedRows.length && <button className="primary" disabled={busy} onClick={()=>void analyze()}>
                <Sparkles size={17} />
                {mode === 'generate' ? '发送给 AI 出题' : '发送给 AI 提取'}
              </button>}
            </div>
          )}
        </div>
      ) : (
        <div className="import-review">
          <div className="review-heading">
            <div>
              <strong>
                {items.length}篇 · {items.reduce((n, p) => n + p.questions.length, 0)}题
              </strong>
              <p>
                {mode === 'generate'
                  ? '将标记为 AI 自创，不能作为历年真题。'
                  : '请对照原资料核对题干、选项、答案和解析。'}
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => {
                setStep('source');
                setError('');
              }}
            >
              返回资料
            </button>
          </div>
          <div className="review-columns">
            <nav className="candidate-list" aria-label="待入库篇目">
              {items.map((p, i) => (
                <button
                  key={i}
                  className={active === i ? 'selected' : ''}
                  onClick={() => setActive(i)}
                >
                  {i + 1}. {p.title || '未命名'}
                  <small>{p.questions.length}题</small>
                </button>
              ))}
            </nav>
            {selected && (
              <section className="candidate-editor">
                <div className="row spread">
                  <h3>篇目 {active + 1}</h3>
                  {items.length > 1 && (
                    <button
                      className="text-link danger-text"
                      onClick={() => {
                        setItems((rows) => rows.filter((_, i) => i !== active));
                        setActive(0);
                        setReviewed(false);
                      }}
                    >
                      <Trash2 size={14} />
                      移除此篇
                    </button>
                  )}
                </div>
                {origin === 'past-paper' && mode === 'extract' && selectedMetadata && (
                  <div className="review-source-metadata">
                    <p className="small-text muted">来源信息可选。AI 识别结果可直接使用或修改；空缺标记待核实，不影响入库。</p>
                    <div className="import-source-fields">
                      {([
                        ['year','考试年份','核对真题年份',4],
                        ['paper','原始试卷名称','核对试卷名称',300],
                        ['reference','原始出处','核对原始出处',800],
                      ] as const).map(([key,label,aria,max]) => (
                        <label className="field" key={key}>
                          {label}（可选 · {selectedMetadata.attribution[key] === 'ai' ? 'AI识别，待核实' : selectedMetadata.attribution[key] === 'user' ? '自行填写' : '待核实'}）
                          <input aria-label={aria} value={selected.metadata?.[key] ?? ''} maxLength={max}
                            placeholder="未识别，可留空"
                            onChange={e => patchItem(p => ({
                              ...p,
                              metadata:{year:'',paper:'',reference:'',evidence:'',...p.metadata,[key]:e.target.value},
                              metadataBasis:{...resolveSourceMetadata(p).attribution,[key]:e.target.value.trim() ? 'user' : 'unknown'},
                            }))} />
                        </label>
                      ))}
                    </div>
                    {selectedMetadata.attribution.evidence && <p className="small-text muted">AI识别依据：{selectedMetadata.attribution.evidence}</p>}
                  </div>
                )}
                <label className="field">
                  标题
                  <input
                    aria-label="预览标题"
                    value={selected.title}
                    maxLength={200}
                    onChange={(e) => patchItem((p) => ({ ...p, title: e.target.value }))}
                  />
                </label>
                <label className="field">
                  内容类型
                  <select
                    aria-label="预览内容类型"
                    value={selected.kind}
                    disabled={mode === 'generate'}
                    onChange={(e) =>
                      patchItem((p) => ({ ...p, kind: e.target.value as Candidate['kind'] }))
                    }
                  >
                    <option value="reading">阅读题</option>
                    <option value="listening">听力题</option>
                    <option value="writing">写作题</option>
                    <option value="article">文章精读</option>
                  </select>
                </label>
                <label className="field">
                  文章 / 题目要求
                  <textarea
                    aria-label="预览原文"
                    rows={7}
                    value={selected.paragraphs.join('\n\n')}
                    onChange={(e) =>
                      patchItem((p) => ({ ...p, paragraphs: e.target.value.split(/\n\s*\n/) }))
                    }
                  />
                </label>
                {selected.questions.map((q, n) => (
                  <details className="review-question" key={n} open={n === 0}>
                    <summary>
                      第{n + 1}题{' '}
                      <span>
                        {q.answer === null || q.answerBasis === 'unconfirmed'
                          ? '答案待确认'
                          : q.answerBasis === 'source'
                            ? '答案来自原资料'
                            : q.answerBasis === 'user'
                              ? '答案已手动确认'
                              : '答案由 AI 补全 / 生成'}
                      </span>
                    </summary>
                    <label className="field">
                      题干
                      <textarea
                        aria-label={'题干 ' + (n + 1)}
                        rows={2}
                        value={q.stem}
                        onChange={(e) => patchQuestion(n, (q) => ({ ...q, stem: e.target.value }))}
                      />
                    </label>
                    <div className="review-option-list">
                      {q.options.map((option, k) => (
                        <label key={k}>
                          <span>{String.fromCharCode(65 + k)}</span>
                          <input
                            aria-label={'第' + (n + 1) + '题选项' + String.fromCharCode(65 + k)}
                            value={option}
                            onChange={(e) =>
                              patchQuestion(n, (q) => ({
                                ...q,
                                options: q.options.map((o, j) => (j === k ? e.target.value : o)),
                              }))
                            }
                          />
                          {q.options.length > 2 && (
                            <button
                              aria-label={
                                '移除第' + (n + 1) + '题选项' + String.fromCharCode(65 + k)
                              }
                              onClick={() =>
                                patchQuestion(n, (q) => ({
                                  ...q,
                                  options: q.options.filter((_, j) => j !== k),
                                  answer: null,
                                  answerBasis: 'unconfirmed',
                                }))
                              }
                            >
                              ×
                            </button>
                          )}
                        </label>
                      ))}
                    </div>
                    {q.options.length < 8 && (
                      <button
                        className="text-link"
                        onClick={() =>
                          patchQuestion(n, (q) => ({ ...q, options: [...q.options, ''] }))
                        }
                      >
                        添加选项
                      </button>
                    )}
                    <label className="field">
                      正确答案
                      <select
                        aria-label={'正确答案 ' + (n + 1)}
                        value={q.answer ?? ''}
                        onChange={(e) =>
                          patchQuestion(n, (q) => ({
                            ...q,
                            answer: e.target.value === '' ? null : Number(e.target.value),
                            answerBasis: e.target.value === '' ? 'unconfirmed' : 'user',
                          }))
                        }
                      >
                        <option value="">待确认</option>
                        {q.options.map((_, k) => (
                          <option key={k} value={k}>
                            {String.fromCharCode(65 + k)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      解析
                      <textarea
                        aria-label={'解析 ' + (n + 1)}
                        value={q.explanation}
                        rows={3}
                        onChange={(e) =>
                          patchQuestion(n, (q) => ({ ...q, explanation: e.target.value }))
                        }
                      />
                    </label>
                    <details>
                      <summary>定位依据与渐进提示</summary>
                      <label className="field">
                        原文依据
                        <textarea
                          rows={2}
                          value={q.evidence}
                          onChange={(e) =>
                            patchQuestion(n, (q) => ({ ...q, evidence: e.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        提示（每行一条）
                        <textarea
                          rows={3}
                          value={q.hints.join('\n')}
                          onChange={(e) =>
                            patchQuestion(n, (q) => ({
                              ...q,
                              hints: e.target.value.split('\n').slice(0, 4),
                            }))
                          }
                        />
                      </label>
                    </details>
                    <button
                      className="text-link danger-text"
                      onClick={() =>
                        patchItem((p) => ({
                          ...p,
                          questions: p.questions.filter((_, j) => j !== n),
                        }))
                      }
                    >
                      <Trash2 size={14} />
                      移除此题
                    </button>
                  </details>
                ))}
                {!['writing', 'article'].includes(selected.kind) && (
                  <button
                    className="secondary"
                    onClick={() =>
                      patchItem((p) => ({
                        ...p,
                        questions: [
                          ...p.questions,
                          {
                            stem: '',
                            options: ['', '', '', ''],
                            answer: null,
                            answerBasis: 'unconfirmed',
                            skill: '阅读理解',
                            explanation: '',
                            evidence: '',
                            hints: [],
                          },
                        ],
                      }))
                    }
                  >
                    <Plus size={16} />
                    补充一道题
                  </button>
                )}
              </section>
            )}
          </div>
          {!!problems.length && (
            <div className="import-validation" role="alert">
              <strong>入库前还需修正</strong>
              {problems.slice(0, 8).map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </div>
          )}
          {duplicatePlan && (duplicatePlan.skipped > 0 || duplicatePlan.skippedQuestions > 0) && (
            <div className="duplicate-notice" role="status" aria-label="入库去重结果">
              <strong>已检测到重复内容</strong>
              <p>将新增 {duplicatePlan.added.length} 篇、{duplicatePlan.addedQuestions} 题；跳过 {duplicatePlan.skippedQuestions} 道重复题、{duplicatePlan.skipped} 篇完全重复内容。</p>
              <p>已有作答、笔记和解析会保留。</p>
            </div>
          )}
          <label className="check-line review-confirm">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            我已核对原文、题目和答案，确认加入自己的题库
          </label>
          <div className="modal-actions">
            <button className="secondary" onClick={onClose}>
              暂不入库
            </button>
            <button className="primary" disabled={!reviewed || problems.length > 0} onClick={save}>
              确认入库并开始
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
      {!!warnings.length && (
        <details className="import-warnings" open>
          <summary>资料与识别提醒（{warnings.length}）</summary>
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </details>
      )}
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
      {(busy || status) && (
        <div className="import-status" role="status">
          <span>
            {busy && <i className="status-spinner" />}
            {status}
          </span>
          {busy && (
            <button className="secondary small-button" onClick={cancel}>
              取消处理
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
