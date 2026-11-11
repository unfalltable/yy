import { test, expect, type Page } from '@playwright/test';
import { defaults, type AppState } from '../src/types';
import { schemaRecord } from './schema-fixture';
async function seed(page:Page, state:AppState) {
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'今天， 从一篇开始。'})).toBeVisible();
  await page.evaluate(async state => {
    const { set } = await import('/node_modules/.vite/deps/idb-keyval.js');
    await set('lingo-state-v1',state);
  },state);
  await page.reload();
  await expect(page.getByRole('heading',{name:'今天， 从一篇开始。'})).toBeVisible();
}
async function freezeClock(page:Page) {
  const epoch=Date.now();
  await page.clock.install({time:epoch});
  await page.clock.pauseAt(epoch+1000);
}
async function begin(page:Page) {
  await page.getByRole('button',{name:'开始学习',exact:true}).click();

}
async function setupMock(page:Page) {
  await page.addInitScript(() => {
    const calls:Record<string,unknown>[] = [], cancelled:string[] = [];
    Object.assign(window,{coachCalls:calls,coachCancelled:cancelled});
    Object.defineProperty(window,'desktop',{configurable:true,value:{
      isDesktop:true,hasKey:async()=>false,
      ai:async(data:Record<string,unknown>)=>{
        calls.push(data);
        if (String(data.prompt).endsWith('[FAIL]')) throw new Error('临时连接失败');
        if (String(data.prompt).endsWith('[SLOW]')) { await new Promise(r=>setTimeout(r,1300)); return '[LATE_REPLY]'; }
        return '[COACH_REPLY] 先做一个小步骤，需要时可以休息。';
      },
      cancelAi:async(id:string)=>{cancelled.push(id);},
    }});
  });
}
test('题目入口先预填，明确发送才答疑；提示和讲解使用对应上下文',async({page})=>{
  await setupMock(page);
  const s = structuredClone(defaults), p = schemaRecord({exam:'英二'});
  s.settings.aiEndpoint='http://127.0.0.1:12345/v1';s.settings.aiModel='deepseek-flash';
  s.customPassages=[p];
  await seed(page,s); await begin(page);
  await page.locator('.passage-card').first().click();
  await page.getByRole('button',{name:'问陪练这道题',exact:true}).click();
  await expect(page.getByLabel('问陪练的问题')).toHaveValue('这道题我有点卡住了，先陪我找一个线索。');
  expect(await page.evaluate(()=>(window as any).coachCalls.length)).toBe(0);
  await page.getByRole('button',{name:'发送问题'}).click();
  await expect(page.getByLabel('陪练完整回答')).toHaveCount(1);
  let request = await page.evaluate(()=>(window as any).coachCalls[0]);
  expect(request.model).toBe('deepseek-flash');
  expect(request.prompt).toContain('当前学习材料的考试类型：英二');
  expect(request.prompt).toContain('[STEM_FIELD]');
  expect(request.prompt).not.toContain('[EXPLANATION_FIELD]');
  expect(request).not.toHaveProperty('max_tokens');
  expect(request).not.toHaveProperty('max_completion_tokens');
  await page.getByRole('button',{name:'讲解与答案',exact:true}).click();
  await expect(page.getByLabel('陪练完整回答')).toHaveCount(2);
  request = await page.evaluate(()=>(window as any).coachCalls[1]);
  expect(request.prompt).toContain('[EXPLANATION_FIELD]');
  await page.getByRole('checkbox',{name:'结合当前学习内容'}).uncheck();
  await page.getByLabel('问陪练的问题').fill('[NO_CONTEXT]');
  await page.getByRole('button',{name:'发送问题'}).click();
  await expect(page.getByLabel('陪练完整回答')).toHaveCount(3);
  request = await page.evaluate(()=>(window as any).coachCalls[2]);
  expect(request.prompt).not.toContain('[STEM_FIELD]');
  expect(request.prompt).toContain('[COACH_REPLY]');
  expect(request.prompt).toContain('用户关闭了学习上下文');
  await page.screenshot({path:'test-results/coach-context-050.png'});
});
test('失败可恢复原问题，停止后迟到回答不污染下一轮',async({page})=>{
  await setupMock(page);
  const s=structuredClone(defaults);
  s.settings.aiEndpoint='http://127.0.0.1:12345/v1';s.settings.aiModel='deepseek-flash';
  await seed(page,s);
  await page.getByRole('button',{name:'问陪练',exact:true}).click();
  await page.getByLabel('问陪练的问题').fill('[FAIL]');
  await page.getByRole('button',{name:'发送问题'}).click();
  await page.getByRole('button',{name:'把上次问题放回输入框'}).click();
  await expect(page.getByLabel('问陪练的问题')).toHaveValue('[FAIL]');
  await page.getByLabel('问陪练的问题').fill('[SLOW]');
  await page.getByRole('button',{name:'发送问题'}).click();
  await page.getByRole('button',{name:'停止回答',exact:true}).click();
  await page.getByLabel('问陪练的问题').fill('[NEXT]');
  await page.getByRole('button',{name:'发送问题'}).click();
  await expect(page.getByLabel('陪练完整回答')).toHaveCount(1);
  await page.waitForTimeout(1500);
  await expect(page.getByLabel('陪练对话记录')).not.toContainText('[LATE_REPLY]');
  expect(await page.evaluate(()=>(window as any).coachCancelled.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).coachCalls.length)).toBe(3);
});
test('前台专注计时、后台暂停和重启恢复；小窗口仍能输入与关闭',async({page})=>{
  await setupMock(page); await freezeClock(page); await seed(page,structuredClone(defaults));
  await page.getByRole('button',{name:'问陪练',exact:true}).click();
  await page.getByRole('button',{name:'专注陪学',exact:true}).click();
  await page.getByLabel('本轮陪学目标').selectOption('15');
  await page.getByRole('button',{name:'开始陪学',exact:true}).click();
  await page.clock.runFor(3000);
  await expect(page.getByLabel('本轮已陪学时长')).toContainText('00:03');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});window.dispatchEvent(new Event('blur'));});
  await page.clock.runFor(6000);
  await expect(page.getByLabel('本轮已陪学时长')).toContainText('00:03');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});window.dispatchEvent(new Event('focus'));});
  await page.clock.runFor(2000);
  await expect(page.getByLabel('本轮已陪学时长')).toContainText('00:05');
  await page.getByRole('button',{name:'暂停陪学',exact:true}).click();
  await page.clock.runFor(4000);
  await expect(page.getByLabel('本轮已陪学时长')).toContainText('00:05');
  expect(await page.evaluate(()=>(window as any).coachCalls.length)).toBe(0);
  await page.getByRole('button',{name:'继续陪学',exact:true}).click();
  await page.clock.runFor(2000);
  await expect(page.getByLabel('本轮已陪学时长')).toContainText('00:07');
  await page.clock.runFor(400);
  await page.reload();
  await page.getByRole('button',{name:'问陪练',exact:true}).click();
  await page.getByRole('button',{name:'专注陪学',exact:true}).click();
  await expect(page.getByRole('button',{name:'继续陪学',exact:true})).toBeVisible();
  await expect(page.getByLabel('本轮已陪学时长')).toContainText('00:07');
  await page.setViewportSize({width:390,height:700});
  const panel=await page.getByLabel('陪练对话',{exact:true}).boundingBox();
  expect(panel!.y).toBeGreaterThan(64);expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x+panel!.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button',{name:'收起对话',exact:true})).toBeInViewport();
  await expect(page.getByLabel('问陪练的问题')).toBeInViewport();
  await page.screenshot({path:'test-results/coach-focus-narrow-050.png'});
});
test('本机鼓励可离线使用，提醒风格可保存',async({page})=>{
  await seed(page,structuredClone(defaults));
  await page.getByRole('button',{name:'问陪练',exact:true}).click();
  await page.getByRole('button',{name:'鼓励一下',exact:true}).click();
  await expect(page.getByLabel('陪练完整回答')).toContainText('不需要一下子做得很好');
  await page.getByRole('button',{name:'收起对话'}).click();
  await page.getByRole('button',{name:'学习记录与设置',exact:true}).click();
  await page.getByRole('navigation',{name:'学习记录与设置'}).getByRole('button',{name:'设置与角色',exact:true}).click();
  await page.getByLabel('陪学提醒风格').selectOption('active');
  await page.waitForTimeout(400);await page.reload();
  await page.getByRole('button',{name:'学习记录与设置',exact:true}).click();
  await page.getByRole('navigation',{name:'学习记录与设置'}).getByRole('button',{name:'设置与角色',exact:true}).click();
  await expect(page.getByLabel('陪学提醒风格')).toHaveValue('active');
});

test('过半提醒在本机触发并保存标记，不自动请求AI',async({page})=>{
  await setupMock(page);
  const s=structuredClone(defaults);
  s.companionSession={id:'notice-session',startedAt:new Date().toISOString(),targetMinutes:15,activeSeconds:451,status:'paused',notices:[]};
  await freezeClock(page); await seed(page,s);
  await page.getByRole('button',{name:'问陪练',exact:true}).click();
  await page.getByRole('button',{name:'专注陪学',exact:true}).click();
  await page.getByRole('button',{name:'继续陪学',exact:true}).click();
  await page.getByRole('button',{name:'收起对话',exact:true}).click();
  await page.getByRole('heading',{name:'今天， 从一篇开始。'}).click();
  await page.clock.fastForward(17000);
  await expect(page.locator('.companion-line')).toHaveCount(0);
  await page.clock.fastForward(65000);
  await expect(page.locator('.companion-line')).toContainText('这一轮已经过半了');
  expect(await page.evaluate(()=>(window as any).coachCalls.length)).toBe(0);
  await page.clock.runFor(400);
  const notices=await page.evaluate(async()=>{
    const {get}=await import('/node_modules/.vite/deps/idb-keyval.js');
    return (await get('lingo-state-v1')).companionSession.notices;
  });
  expect(notices).toContain('half');
  await page.getByRole('button',{name:'收起陪练气泡',exact:true}).click();
  await page.clock.fastForward(65000);
  await expect(page.locator('.companion-line')).toHaveCount(0);
});
