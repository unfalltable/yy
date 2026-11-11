import { describe, expect, it } from 'vitest';
import { filterBank, defaultBankFilters, passageProgress } from './bankFilters';
import { defaults } from './types';
import { schemaRecord } from '../tests/schema-fixture';

const first = schemaRecord({ id:'one', exam:'英一', year:'2024', title:'A', difficulty:'挑战' });
const second = schemaRecord({ id:'two', exam:'英二', year:'2020', title:'B', difficulty:'基础',
  provenance:{kind:'practice',paper:'[PAPER]',reference:'[REFERENCE]'} });
const unknown = schemaRecord({ id:'unknown', exam:'IELTS', year:'', title:'C' });
const bank=[first,second,unknown];
describe('跨考试题库筛选',()=>{
  it('默认不受默认考试限制，筛选与排序不修改题库或设置',()=>{
    const state=structuredClone(defaults);state.settings.exam='英二';
    const original=JSON.stringify(bank);
    expect(filterBank(bank,state,defaultBankFilters,'reading').map(p=>p.id)).toEqual(['one','two','unknown']);
    expect(filterBank(bank,state,{...defaultBankFilters,exam:'英一'},'reading')).toEqual([first]);
    expect(state.settings.exam).toBe('英二');expect(JSON.stringify(bank)).toBe(original);
  });
  it('考试、年份、难度、来源和搜索可叠加，不同条件不会意外扩大范围',()=>{
    const filters={...defaultBankFilters,exam:'英二' as const,year:'2020',difficulty:'基础' as const,
      origin:'practice' as const,query:' [reference] '};
    expect(filterBank(bank,defaults,filters,'reading')).toEqual([second]);
    expect(filterBank(bank,defaults,{...filters,difficulty:'挑战'},'reading')).toEqual([]);
    expect(filterBank(bank,defaults,{...defaultBankFilters,year:'unknown'},'reading')).toEqual([unknown]);
  });
  it('进度区分未开始、进行中、已完成，作文和文章不冒充已完成',()=>{
    const state=structuredClone(defaults);
    const draft={answers:{},hints:{},seconds:0,index:0,finished:false,checked:[],times:{}};
    state.drafts.one={...draft};state.drafts.two={...draft,finished:true};
    expect(filterBank(bank,state,{...defaultBankFilters,progress:'ongoing'},'reading')).toEqual([first]);
    expect(filterBank(bank,state,{...defaultBankFilters,progress:'completed'},'reading')).toEqual([second]);
    expect(filterBank(bank,state,{...defaultBankFilters,progress:'unstarted'},'reading')).toEqual([unknown]);
    const writing=schemaRecord({id:'write',kind:'writing',questions:[]});
    state.writingDrafts.write={text:'[DRAFT]',feedback:'',updatedAt:''};
    expect(passageProgress(writing,state)).toBe('ongoing');
    expect(passageProgress(schemaRecord({kind:'article',questions:[]}),state)).toBeNull();
  });
  it('按学习方式选题，阅读包含文章，写作和听力也可跨考试',()=>{
    const article=schemaRecord({id:'article',kind:'article',questions:[]});
    const writing=schemaRecord({id:'writing',exam:'英一',kind:'writing',questions:[]});
    const listening=schemaRecord({id:'listening',exam:'TOEFL',kind:'listening'});
    const all=[...bank,article,writing,listening];
    expect(filterBank(all,defaults,defaultBankFilters,'reading').map(p=>p.id)).toEqual(['one','two','unknown','article']);
    expect(filterBank(all,defaults,defaultBankFilters,'writing')).toEqual([writing]);
    expect(filterBank(all,defaults,defaultBankFilters,'listening')).toEqual([listening]);
  });
  it('年份倒序把未知年份放最后，标题排序稳定且不改变原顺序',()=>{
    const unordered=[unknown,second,first];
    expect(filterBank(unordered,defaults,{...defaultBankFilters,sort:'year'},'reading')).toEqual(bank);
    expect(filterBank(unordered,defaults,{...defaultBankFilters,sort:'title'},'reading')).toEqual(bank);
    expect(unordered[0]).toBe(unknown);
  });
});
