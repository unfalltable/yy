import { test, expect, type Page } from '@playwright/test';
import { defaults, type AppState } from '../src/types';
import { schemaRecord } from './schema-fixture';

const one=schemaRecord({id:'one',title:'[ONE_TITLE]',exam:'英一',year:'2024',difficulty:'挑战'});
const two=schemaRecord({id:'two',title:'[TWO_TITLE]',exam:'英二',year:'2020',
  provenance:{kind:'practice',paper:'[PAPER]',reference:'[REFERENCE]'}});
const ielts=schemaRecord({id:'ielts',title:'[IELTS_TITLE]',exam:'IELTS',year:''});
async function seed(page:Page, state:AppState) {
  await page.goto('/');
  await expect(page.getByRole('button',{name:'开始学习',exact:true})).toBeVisible();
  await page.evaluate(async state=>{
    const {set}=await import('/node_modules/.vite/deps/idb-keyval.js');
    await set('lingo-state-v1',state);
  },state);
  await page.reload();
  await page.getByRole('button',{name:'开始学习',exact:true}).click();
}
function state(){
  const s=structuredClone(defaults);s.settings.exam='英二';s.customPassages=[one,two,ielts];return s;
}
test('英二默认设置仍展示并可练英一，换题保留两边草稿和筛选条件',async({page})=>{
  await seed(page,state());
  await expect(page.getByLabel('考试范围',{exact:true})).toHaveValue('all');
  await expect(page.locator('.passage-card')).toHaveCount(3);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.passage-card').filter({hasText:'[ONE_TITLE]'}).click();
  await page.getByRole('radio').nth(1).click();
  await page.getByRole('button',{name:'筛选 / 换题',exact:true}).click();
  let picker=page.getByRole('dialog',{name:'筛选与选择题目'});
  await picker.getByLabel('考试范围',{exact:true}).selectOption('英二');
  await picker.locator('.passage-card').click();
  await expect(page.locator('.practice-heading .tag')).toContainText('英二');
  await page.getByRole('radio').nth(0).click();
  await page.getByRole('button',{name:'筛选 / 换题',exact:true}).click();
  picker=page.getByRole('dialog',{name:'筛选与选择题目'});
  await expect(picker.getByLabel('考试范围',{exact:true})).toHaveValue('英二');
  await picker.getByLabel('考试范围',{exact:true}).selectOption('英一');
  await picker.locator('.passage-card').click();
  await expect(page.getByRole('radio').nth(1)).toHaveAttribute('aria-checked','true');
  await page.getByRole('button',{name:'选择题目',exact:true}).click();
  await expect(page.getByLabel('考试范围',{exact:true})).toHaveValue('英一');
  const saved=await page.evaluate(async()=>{
    const {get}=await import('/node_modules/.vite/deps/idb-keyval.js');
    return await get('lingo-state-v1');
  });
  expect(saved.settings.exam).toBe('英二');
  expect(saved.drafts.one.answers['schema-question']).toBe(1);
  expect(saved.drafts.two.answers['schema-question']).toBe(0);
  await page.screenshot({path:'test-results/bank-cross-exam-060.png',fullPage:true});
});
test('考试年份难度来源进度搜索与排序可组合，空结果可一键恢复',async({page})=>{
  const s=state();
  s.drafts.one={answers:{},hints:{},seconds:5,index:0,finished:true,checked:['schema-question'],times:{}};
  s.drafts.two={answers:{},hints:{},seconds:2,index:0,finished:false,checked:[],times:{}};
  await seed(page,s);
  await page.getByLabel('题目排序',{exact:true}).selectOption('year');
  await expect(page.locator('.passage-card h3')).toHaveText(['[ONE_TITLE]','[TWO_TITLE]','[IELTS_TITLE]']);
  await page.getByLabel('考试范围',{exact:true}).selectOption('英二');
  await page.getByLabel('题目年份',{exact:true}).selectOption('2020');
  await page.getByLabel('题目难度',{exact:true}).selectOption('基础');
  await page.getByLabel('学习进度',{exact:true}).selectOption('ongoing');
  await page.getByRole('button',{name:'个人练习',exact:true}).click();
  await page.getByLabel('搜索题库',{exact:true}).fill('[REFERENCE]');
  await expect(page.locator('.passage-card h3')).toHaveText(['[TWO_TITLE]']);
  await page.getByLabel('题目难度',{exact:true}).selectOption('挑战');
  await expect(page.getByText('没有匹配的内容',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'查看全部题目',exact:true}).click();
  await expect(page.locator('.passage-card')).toHaveCount(3);
  await expect(page.getByLabel('搜索题库',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('考试范围',{exact:true})).toHaveValue('all');
  await page.getByLabel('学习进度',{exact:true}).selectOption('completed');
  await expect(page.locator('.passage-card h3')).toHaveText(['[ONE_TITLE]']);
  await page.getByRole('button',{name:'清除筛选',exact:true}).click();
  await page.getByLabel('题目年份',{exact:true}).selectOption('unknown');
  await expect(page.locator('.passage-card h3')).toHaveText(['[IELTS_TITLE]']);
});
test('写作与听力跨考试可练；筛选弹窗支持键盘关闭并保留作文',async({page})=>{
  const s=state();
  s.customPassages.push(schemaRecord({id:'w-one',title:'[WRITE_ONE]',exam:'英一',kind:'writing',questions:[]}),
    schemaRecord({id:'w-two',title:'[WRITE_TWO]',exam:'英二',kind:'writing',questions:[]}),
    schemaRecord({id:'listen',title:'[LISTEN_TOEFL]',exam:'TOEFL',kind:'listening'}));
  await seed(page,s);
  await page.getByRole('navigation',{name:'学习方式'}).getByRole('button',{name:'写作',exact:true}).click();
  await expect(page.getByRole('heading',{name:'[WRITE_ONE]',exact:true})).toBeVisible();
  await page.getByLabel('我的作文',{exact:true}).fill('[ESSAY_ONE]');
  await page.getByRole('button',{name:'筛选 / 换题',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'筛选与选择题目'});
  await picker.getByLabel('考试范围',{exact:true}).selectOption('英二');
  await picker.locator('.passage-card').click();
  await page.getByLabel('我的作文',{exact:true}).fill('[ESSAY_TWO]');
  await page.getByLabel('选择写作题',{exact:true}).selectOption('w-one');
  await expect(page.getByLabel('我的作文',{exact:true})).toHaveValue('[ESSAY_ONE]');
  await page.getByRole('button',{name:'筛选 / 换题',exact:true}).click();
  await page.getByRole('dialog').getByLabel('考试范围',{exact:true}).selectOption('all');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('我的作文',{exact:true})).toHaveValue('[ESSAY_ONE]');
  await page.getByRole('navigation',{name:'学习方式'}).getByRole('button',{name:'听力',exact:false}).click();
  await expect(page.locator('.reading-header h1')).toHaveText('[LISTEN_TOEFL]');
  await page.getByRole('button',{name:'筛选 / 换题',exact:true}).click();
  await page.setViewportSize({width:390,height:750});
  await expect(page.getByRole('dialog').getByLabel('考试范围',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/bank-picker-narrow-060.png'});
});
