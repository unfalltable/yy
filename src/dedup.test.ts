import { describe, it, expect } from 'vitest';
import { schemaRecord } from '../tests/schema-fixture';
import { dedupePassages, fingerprintMaterial, matchingMaterialIds } from './dedup';
import { defaults, type SourceMaterial } from './types';
import { parseBackup } from './core';
const record=()=>schemaRecord();
const material=(id='material'):SourceMaterial=>({id,name:'file.pdf',format:'pdf',text:'[DOCUMENT_BODY_FIELD]',images:[],at:'2000-01-01'});
describe('按题目内容去重',()=>{
  it('忽略解析生成的新ID、题号、标题、出处、答案和解析变化；保留原对象',()=>{
    const old=record(), incoming=structuredClone(old);incoming.id='new';incoming.title='new title';incoming.year='2024';incoming.source='new source';
    incoming.questions[0]={...incoming.questions[0],id:'new-q',stem:'21.  '+incoming.questions[0].stem,answer:1,explanation:'changed'};
    const plan=dedupePassages([old],[incoming]);
    expect(plan.added).toEqual([]);expect(plan.skippedQuestions).toBe(1);expect(plan.firstMatch).toBe(old);
    expect(old.questions[0].answer).toBe(0);
  });
  it('空白、全角、选项标号和顺序变化仍识别，保留新题与旧记录',()=>{
    const old=record(), q=old.questions[0];
    const duplicate={...q,id:'dup',stem:'  [ＳＴＥＭ＿ＦＩＥＬＤ] \n',options:['A. '+q.options[1],'B. '+q.options[0]]};
    const fresh={...q,id:'fresh',stem:'[NEW_STEM_FIELD]'};
    const incoming={...old,id:'new',questions:[duplicate,fresh,{...fresh,id:'another'}]};
    const plan=dedupePassages([old],[incoming]);
    expect(plan.added[0].questions.map(q=>q.id)).toEqual(['fresh']);expect(plan.skippedQuestions).toBe(2);
    expect(old.questions).toEqual([q]);
  });
  it('不同原文、考试、选项或听力音频不误删',()=>{
    const old=record(), q=old.questions[0];
    const incoming=[
      {...old,id:'new-context',paragraphs:['[NEW_PARAGRAPH]']},
      {...old,id:'new-exam',exam:'英二' as const},
      {...old,id:'new-options',questions:[{...q,options:['[DIFFERENT_OPTION]',q.options[1]]}]},
    ];
    expect(dedupePassages([old],incoming).added).toHaveLength(3);
    const caseSensitive={...old,questions:[{...q,options:['Polish','Other']}]};
    expect(dedupePassages([caseSensitive],[{...caseSensitive,id:'lower-case',questions:[{...q,options:['polish','Other']}]}]).added).toHaveLength(1);
    const listening={...old,kind:'listening' as const,audio:'data:audio/wav;base64,eA=='};
    expect(dedupePassages([listening],[{...listening,id:'audio-other',audio:'data:audio/wav;base64,eQ=='}]).added).toHaveLength(1);
  });
  it('同批、已有旧数据和JSON换ID都去重；同ID仍不覆盖',()=>{
    const old=record(), renamed={...old,id:'renamed'};
    expect(dedupePassages([], [old,renamed]).added).toHaveLength(1);
    expect(dedupePassages([old], [renamed]).skipped).toBe(1);
    expect(dedupePassages([old],[{...old,paragraphs:['[CHANGED]']}]).added).toEqual([]);
  });
  it('文章与写作可去重，但不同写作图片不会按通用题干误判',()=>{
    const article={...record(),kind:'article' as const,questions:[]};
    expect(dedupePassages([article],[{...article,id:'new'}]).skipped).toBe(1);
    const a={...material('a'),images:[{name:'a',url:'data:image/jpeg;base64,eA=='}]};
    const b={...material('b'),images:[{name:'b',url:'data:image/jpeg;base64,eQ=='}]};
    const writing={...article,kind:'writing' as const,materialId:'a'};
    expect(dedupePassages([writing],[{...writing,id:'new',materialId:'b'}],[],[a,b]).added).toHaveLength(1);
    expect(dedupePassages([writing],[{...writing,id:'new'}],[],[a,b]).skipped).toBe(1);
  });
});
describe('资料批次指纹',()=>{
  it('重复文件改名也匹配；更改正文、页图或批次不混淆',async()=>{
    const a=material(), b={...material('new'),name:'renamed.pdf',at:'2026-11-11'};
    expect(await fingerprintMaterial(a)).toBe(await fingerprintMaterial(b));
    expect(await matchingMaterialIds(b,[a])).toMatchObject({ids:[a.id]});
    expect(await fingerprintMaterial({...a,text:'[NEW_BODY]'})).not.toBe(await fingerprintMaterial(a));
    const img={name:'file',page:1,url:'data:image/jpeg;base64,eA=='};
    expect(await fingerprintMaterial({...a,images:[img]})).not.toBe(await fingerprintMaterial({...a,images:[{...img,page:2}]}));
  });
  it('兼容无指纹旧资料，指纹随备份保留；取消后不会继续处理',async()=>{
    const a=material();const hash=await fingerprintMaterial(a);
    const restored=parseBackup(JSON.stringify({...defaults,materials:[{...a,contentHash:hash}]}));
    expect(restored.materials[0].contentHash).toBe(hash);
    const controller=new AbortController();controller.abort();
    await expect(matchingMaterialIds(a,[a],controller.signal)).rejects.toThrow('取消');
  });
});
