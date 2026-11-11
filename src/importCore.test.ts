import { describe, it, expect } from 'vitest';
import { parseBank, parseBackup } from './core';
import { defaults } from './types';
import { schemaRecord } from '../tests/schema-fixture';
import {
  parseImportResponse,
  prepareCandidateMetadata,
  candidateProblems,
  toPassages,
  parsePageRange,
  buildImportPrompt,
  validateMaterialBatch,
  type Candidate,
} from './importCore';
const item = (): Candidate => ({
  title: '[TITLE_FIELD]',
  kind: 'reading',
  paragraphs: ['[DOCUMENT_BODY_FIELD]'],
  sourceLocator: '[PAGE_FIELD]',
  questions: [
    {
      stem: '[STEM_FIELD]',
      options: ['[OPTION_FIELD_0]', '[OPTION_FIELD_1]'],
      answer: 0,
      answerBasis: 'ai',
      skill: '[SKILL_FIELD]',
      explanation: '[EXPLANATION_FIELD]',
      evidence: '[EVIDENCE_FIELD]',
      hints: ['[HINT_FIELD]'],
    },
  ],
});
const material = {
  id: 'material',
  name: '[FILE_FIELD]',
  text: '[DOCUMENT_BODY_FIELD]',
  images: [],
  at: '2000-01-01',
};
describe('个人资料与AI自创', () => {
  it('个人题库允许模拟和AI自创，真题入口继续限制来源', () => {
    for (const kind of ['practice', 'ai-generated', 'article'] as const) {
      const p = schemaRecord({
        source: '个人模拟 / AI生成资料',
        provenance: { kind, paper: '[PAPER]', reference: '[REF]' },
        year: '',
      });
      expect(
        parseBank(JSON.stringify({ version: 1, contentType: 'personal-bank', passages: [p] }))[0]
          .provenance?.kind,
      ).toBe(kind);
      expect(() =>
        parseBank(JSON.stringify({ version: 1, contentType: 'past-paper', passages: [p] })),
      ).toThrow('不能混入');
    }
  });
  it('解析完整JSON及代码块，不执行任意文本', () => {
    expect(parseImportResponse(JSON.stringify({ items: [item()] })).items).toHaveLength(1);
    expect(
      parseImportResponse(
        '\x60\x60\x60json\n' + JSON.stringify({ items: [item()] }) + '\n\x60\x60\x60',
      ).items,
    ).toHaveLength(1);
    expect(() => parseImportResponse('delete all files')).toThrow('完整 JSON');
  });
  it('答案不确定或超出选项时阻止入库', () => {
    const p = item();
    p.questions[0].answer = null;
    p.questions[0].answerBasis = 'unconfirmed';
    expect(candidateProblems([p], 'extract').join()).toContain('答案待确认');
    p.questions[0].answer = 9;
    expect(candidateProblems([p], 'extract').join()).toContain('答案待确认');
  });
  it('自创阅读验证5题4选项，无法由AI冒充真题', () => {
    const p = item();
    expect(candidateProblems([p], 'generate').length).toBeGreaterThan(0);
    p.questions = Array.from({ length: 5 }, (_,index) => ({
      ...item().questions[0],
      stem:'[STEM_'+index+']',
      options: ['A', 'B', 'C', 'D'],
    }));
    expect(candidateProblems([p], 'generate')).toEqual([]);
    const result = toPassages([p], {
      mode: 'generate',
      exam: '英二',
      origin: 'past-paper',
      year: '2024',
      paper: '[PAPER]',
      reference: '[REF]',
      adapted: true,
      materialId: 'material',
      materialName: '[FILE]',
    })[0];
    expect(result.provenance?.kind).toBe('ai-generated');
    expect(result.adapted).toBe(true);
    expect(result.questions.every((q) => q.answerBasis === 'ai')).toBe(true);
  });
  it('PDF范围校验与批量上限，不默默读越界页面', () => {
    expect(parsePageRange('1-3,5,2', 10)).toEqual([1, 2, 3, 5]);
    expect(parsePageRange('', 12)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(parsePageRange('', 40)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(parsePageRange('1-20,1', 40)).toHaveLength(20);
    expect(parsePageRange('21-40', 40)).toEqual(Array.from({ length: 20 }, (_, i) => i + 21));
    for (const range of ['0', '4-2', '1-21', '1-20,22', 'abc', '41'])
      expect(() => parsePageRange(range, 40)).toThrow();
  });
  it('20页PDF可发送和恢复备份，21页被拦截且照片仍最多6张', () => {
    const pdf = {
      ...material,
      format: 'pdf' as const,
      images: Array.from({ length: 20 }, (_, i) => ({
        name: '[PDF_PAGE]',
        url: 'data:image/jpeg;base64,eA==',
        page: i + 1,
      })),
    };
    expect(() => validateMaterialBatch(pdf)).not.toThrow();
    expect(buildImportPrompt('extract', '英二', pdf, false, true)).toContain('[DOCUMENT_BODY_FIELD]');
    const restored = parseBackup(JSON.stringify({ ...defaults, materials: [pdf] }));
    expect(restored.materials[0].format).toBe('pdf');
    expect(restored.materials[0].images).toHaveLength(20);
    expect(() => validateMaterialBatch({ ...pdf, images: [...pdf.images, pdf.images[0]] })).toThrow('20页');
    expect(() => validateMaterialBatch({ ...pdf, format: 'image' })).toThrow('6张');
  });
  it('超过旧2万字的整批资料可发送并恢复，10万字符上限仍有效', () => {
    const dense = { ...material, text: '[DOCUMENT_BODY_FIELD]'.repeat(3000) };
    expect(dense.text.length).toBeGreaterThan(50000);
    expect(() => validateMaterialBatch(dense)).not.toThrow();
    expect(buildImportPrompt('extract', '英二', dense, false, true)).toContain(dense.text);
    expect(parseBackup(JSON.stringify({ ...defaults, materials: [dense] })).materials[0].text).toBe(dense.text);
    expect(() => validateMaterialBatch({ ...dense, text: 'x'.repeat(100001) })).toThrow('10万');
  });
  it('文章生成可保留原文，AI补全与改写均需明确', () => {
    expect(buildImportPrompt('generate', '英一', material, false, true)).toContain('不得改写');
    expect(buildImportPrompt('generate', '英二', material, true, true)).toContain('允许改写');
    expect(buildImportPrompt('extract', '英一', material, false, false)).toContain('不推测答案');
  });
  it('超大资料和超量题目在发送与入库前被拦截', () => {
    expect(() => validateMaterialBatch({ ...material, text: 'x'.repeat(100001) })).toThrow('10万');
    expect(() =>
      validateMaterialBatch({
        ...material,
        images: Array.from({ length: 7 }, () => ({
          name: '[IMAGE]',
          url: 'data:image/jpeg;base64,eA==',
        })),
      }),
    ).toThrow('6张');
    const p = item();
    p.questions = Array.from({ length: 31 }, () => ({ ...item().questions[0] }));
    expect(candidateProblems([p], 'extract').join()).toContain('30题');
    expect(candidateProblems([item(), item()], 'generate').join()).toContain('1篇');
  });
  it('恢复旧数据补齐资料列表，不删除新建个人模拟资料', () => {
    const s = structuredClone(defaults);
    s.customPassages = [
      schemaRecord({
        source: '用户购买的模拟题',
        provenance: { kind: 'practice', paper: '[PAPER]', reference: '[REF]' },
      }),
    ];
    delete (s as Partial<typeof defaults>).materials;
    const restored = parseBackup(JSON.stringify(s));
    expect(restored.materials).toEqual([]);
    expect(restored.customPassages).toHaveLength(1);
  });
});

describe('来源信息可选与AI识别', () => {
  const config = { mode:'extract' as const,exam:'英二' as const,origin:'past-paper' as const,year:'',paper:'',reference:'',adapted:false,materialId:'material',materialName:'[UPLOADED_FILE].pdf' };
  it('三项全空或旧AI不返回metadata也可入库，保留上传资料并标待核实', () => {
    const candidate = prepareCandidateMetadata(parseImportResponse(JSON.stringify({items:[item()]})).items[0],config);
    const p = toPassages([candidate],config)[0];
    expect(p.year).toBe('');
    expect(p.provenance?.paper).toBe(config.materialName);
    expect(p.source).toContain('原始出处待核实');
    expect(p.provenance?.metadata).toMatchObject({year:'unknown',paper:'unknown',reference:'unknown'});
    expect(parseBackup(JSON.stringify({...defaults,customPassages:[p]})).customPassages[0]).toEqual(p);
    expect(parseBank(JSON.stringify({version:1,contentType:'past-paper',passages:[p]}))[0]).toEqual(p);
  });
  it('每篇使用自己的识别结果，AI识别来源不伪装成人工确认', () => {
    const candidates = [2010,2011].map(year=>prepareCandidateMetadata({...item(),metadata:{year:String(year),paper:'[PAPER_'+year+']',reference:'[REF_'+year+']',evidence:'[HEADER_FIELD]'}},config));
    const ps=toPassages(candidates,config);
    expect(ps.map(p=>p.year)).toEqual(['2010','2011']);
    expect(ps.map(p=>p.provenance?.paper)).toEqual(['[PAPER_2010]','[PAPER_2011]']);
    expect(ps[0].provenance?.metadata).toMatchObject({year:'ai',paper:'ai',reference:'ai',evidence:'[HEADER_FIELD]'});
  });
  it('用户填写优先，核对页改为手填或清空后按当前值保存', () => {
    const candidate=prepareCandidateMetadata({...item(),metadata:{year:'2010',paper:'[AI_PAPER]',reference:'[AI_REF]',evidence:'[HEADER]'}},{...config,year:'2024',paper:'[USER_PAPER]'});
    expect(candidate.metadataBasis).toMatchObject({year:'user',paper:'user',reference:'ai'});
    candidate.metadata!.year='';
    candidate.metadataBasis!.year='unknown';
    const p=toPassages([candidate],{...config,year:'2024'})[0];
    expect(p.year).toBe('');
    expect(p.provenance?.paper).toBe('[USER_PAPER]');
    expect(p.provenance?.metadata?.year).toBe('unknown');
  });
  it('null、缺失和无法确定的年份保持未知，模型返回数字年份可解析', () => {
    const raw=parseImportResponse(JSON.stringify({items:[{...item(),metadata:{year:2010,paper:null,reference:null}}]})).items[0];
    expect(raw.metadata?.year).toBe('2010');
    const p=toPassages([{...item(),metadata:{year:'无法判断',paper:'',reference:'',evidence:''}}],config)[0];
    expect(p.year).toBe('');
    expect(p.provenance?.metadata?.year).toBe('unknown');
    expect(buildImportPrompt('extract','英二',material,false,true)).toContain('不编造网址或官方来源');
  });
});
