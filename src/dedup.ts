import type { Passage, SourceMaterial } from './types';

// Formatting changes do not make a new question. Meaningful words and punctuation remain.
export function normalizeStudyText(value: string) {
  return value.normalize('NFKC')
    .replace(/([A-Za-z]{2,})-\s*\n\s*([a-z])/g, '$1$2')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ').trim();
}
export function questionIdentity(question: Pick<Passage['questions'][number], 'stem' | 'options'>) {
  const stem = question.stem.normalize('NFKC').replace(/^\s*(?:第\s*\d+\s*题[.、:：]?\s*|(?:Q(?:uestion)?\s*)?\d{1,3}[.)、:：]\s+)/i, '');
  const rawOptions = question.options.map(option=>option.normalize('NFKC'));
  const labelled = rawOptions.every((option,index) =>
    new RegExp('^\\s*' + String.fromCharCode(65+index) + '[.)、:：]\\s+','i').test(option));
  const options = rawOptions.map(option => normalizeStudyText(labelled ? option.replace(/^\s*[A-H][.)、:：]\s+/i,'') : option)).sort();
  return JSON.stringify([normalizeStudyText(stem),options]);
}
export function dedupePassages(
  existing: Passage[], incoming: Passage[], builtins: Passage[] = [],
  materials: SourceMaterial[] = [],
) {
  const materialById = new Map(materials.map(m => [m.id,m]));
  const contextKey = (p:Passage) => {
    // Images can be the actual writing prompt; equal generic instructions are insufficient.
    const material = p.materialId ? materialById.get(p.materialId) : undefined;
    const visual = p.kind === 'writing'
      ? material ? material.images.map(i=>i.url) : p.materialId ?? ''
      : '';
    return JSON.stringify([p.exam,p.kind,normalizeStudyText(p.paragraphs.join('\n')),p.kind==='listening' ? p.audio ?? '' : '',visual]);
  };
  type Bucket = { questions:Set<string>; first:Passage };
  const buckets = new Map<string,Bucket>(), ids = new Map<string,Passage>();
  for (const p of [...existing,...builtins]) {
    ids.set(p.id,p);
    const key=contextKey(p), bucket=buckets.get(key) ?? {questions:new Set<string>(),first:p};
    for(const q of p.questions) bucket.questions.add(questionIdentity(q));
    buckets.set(key,bucket);
  }
  const added:Passage[]=[];
  let skipped=0,skippedQuestions=0;
  let firstMatch:Passage|undefined;
  for(const p of incoming) {
    const collision=ids.get(p.id);
    if(collision) {
      skipped++;skippedQuestions+=p.questions.length;firstMatch ??= collision;continue;
    }
    ids.set(p.id,p);
    const key=contextKey(p), bucket=buckets.get(key);
    if(!p.questions.length) {
      if(bucket) {skipped++;firstMatch ??= bucket.first;continue;}
      added.push(p);buckets.set(key,{questions:new Set(),first:p});continue;
    }
    const seen=bucket?.questions ?? new Set<string>(), questions:Passage['questions']=[];
    for(const q of p.questions) {
      const identity=questionIdentity(q);
      if(seen.has(identity)) {skippedQuestions++;firstMatch ??= bucket?.first ?? p;}
      else {seen.add(identity);questions.push(q);}
    }
    if(!questions.length) {skipped++;continue;}
    const unique=questions.length===p.questions.length ? p : {...p,questions};
    added.push(unique);
    buckets.set(key,{questions:seen,first:bucket?.first ?? unique});
  }
  return { added,skipped,skippedQuestions,firstMatch,
    addedQuestions:added.reduce((n,p)=>n+p.questions.length,0) };
}
const signatures = new WeakMap<SourceMaterial,Promise<string>>();
export function fingerprintMaterial(material: SourceMaterial) {
  let pending=signatures.get(material);
  if(!pending) {
    const content=JSON.stringify([material.format ?? 'text',normalizeStudyText(material.text),
      material.images.map(i=>[i.page ?? null,i.url])]);
    pending=crypto.subtle.digest('SHA-256',new TextEncoder().encode(content)).then(buffer=>
      Array.from(new Uint8Array(buffer),n=>n.toString(16).padStart(2,'0')).join(''));
    signatures.set(material,pending);
  }
  return pending;
}
export async function matchingMaterialIds(material:SourceMaterial, existing:SourceMaterial[], signal?:AbortSignal) {
  const fingerprint=await fingerprintMaterial(material), ids:string[]=[];
  for(const saved of existing) {
    if(signal?.aborted) throw new DOMException('已取消','AbortError');
    if(await fingerprintMaterial(saved)===fingerprint) ids.push(saved.id);
  }
  return {fingerprint,ids};
}
