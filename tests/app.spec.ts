import { test, expect, type Page } from '@playwright/test';
import { defaults } from '../src/types';
import { schemaRecord, bankEnvelope } from './schema-fixture';
const upload = (records: ReturnType<typeof schemaRecord>[]) => ({
  name: 'schema-fields.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(bankEnvelope(records))),
});
async function begin(page: Page, exam?: string) {
  await page.getByRole('button', { name: '开始学习', exact: true }).click();
  if (exam) await page.getByLabel('考试范围',{exact:true}).selectOption({ label: exam });
}
async function menu(page: Page, name: string) {
  await page.getByRole('button', { name: '学习记录与设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '学习记录与设置' })
    .getByRole('button', { name, exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天， 从一篇开始。' })).toBeVisible();
});
test('首页直接进入题库，考试是可选筛选，听说标签准确', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.locator('.stats-strip')).toHaveCount(0);
  await begin(page, '考研英语二');
  await expect(page.getByRole('heading', { name: '我的题库', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '学习方式' })).toContainText('听力拓展');
  await page.getByLabel('考试范围',{exact:true}).selectOption('IELTS');
  await expect(page.getByRole('navigation', { name: '学习方式' })).not.toContainText('拓展');
  for (const name of ['错题回顾', '我的笔记', '生词本', '学习报告', '设置与角色']) {
    await menu(page, name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(errors).toEqual([]);
});
test('空题库入口与空白模板，没有虚构题', async ({ page }) => {
  await begin(page);
  await expect(page.locator('.library-count')).toContainText('共 0 篇内容');
  await expect(page.getByText('添加你的第一份学习资料', { exact: true })).toBeVisible();
  await page.getByText('题库JSON与来源说明', { exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载空白导入模板' }).click();
  const file = await (await pending).path(),
    fs = await import('node:fs/promises');
  expect(JSON.parse(await fs.readFile(file!, 'utf8'))).toEqual({
    version: 1,
    contentType: 'personal-bank',
    passages: [],
  });
  await menu(page, '错题回顾');
  await page.getByRole('button', { name: '开始一篇练习' }).click();
  await expect(page.locator('.library-count')).toContainText('共 0 篇内容');
});
test('跟读无预置生成句，写作无虚构题干', async ({ page }) => {
  await begin(page);
  await page.getByLabel('考试范围',{exact:true}).selectOption('英一');
  await page.getByRole('button', { name: '口语拓展', exact: true }).click();
  await expect(page.getByLabel('跟读文本')).toHaveValue('');
  await expect(page.getByRole('button', { name: '开始跟读录音' })).toBeDisabled();
  await expect(page.locator('.sentence-choices button')).toHaveCount(0);
  await expect(page.getByText('不属于考研英语初试科目。', { exact: false })).toBeVisible();
  await page
    .getByRole('navigation', { name: '学习方式' })
    .getByRole('button', { name: '写作', exact: true })
    .click();
  await expect(page.getByText('还没有写作题', { exact: true })).toBeVisible();
  await expect(page.getByLabel('我的作文')).toHaveCount(0);
});
test('导入后直接逐题作答、反馈表情、断点继续', async ({ page }) => {
  await begin(page);
  await page.locator('#bank-json').setInputFiles(
    upload([
      schemaRecord({
        questions: [
          schemaRecord().questions[0],
          { ...schemaRecord().questions[0], id: 'second-question', stem:'[SECOND_STEM_FIELD]' },
        ],
      }),
    ]),
  );
  await expect(page.locator('.question-body h2')).toHaveText('[STEM_FIELD]');
  await page.getByRole('radio').nth(1).click();
  await page.getByRole('button', { name: '给点提示', exact: false }).click();
  await expect(page.locator('.vrm-avatar')).toHaveAttribute('data-mood', 'thinking');
  await page.getByRole('button', { name: '确认答案' }).click();
  await expect(page.locator('.vrm-avatar')).toHaveAttribute('data-mood', 'encourage');
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await page.getByRole('radio').nth(0).click();
  await page.getByRole('button', { name: '确认答案' }).click();
  await expect(page.getByRole('dialog')).toContainText('本篇已完成');
  await page.getByRole('button', { name: '回看解析', exact: true }).click();
  await expect(page.locator('.vrm-avatar')).toHaveAttribute('data-mood', 'happy');
  await page.getByRole('button', { name: '选择题目', exact: true }).first().click();
  await page.locator('#bank-json').setInputFiles(upload([schemaRecord()]));
  await expect(page.locator('.toast[role="status"]')).toContainText('跳过 1');
  await page.getByRole('button', { name: 'Lingo 首页' }).click();
  await begin(page);
  await page.locator('.passage-card').first().click();
  await expect(page.locator('.question-body h2')).toHaveText('[SECOND_STEM_FIELD]');
});
test('跨考试续做不改变默认考试，返回首页可以继续上次练习', async ({ page }) => {
  await begin(page);
  await page.locator('#bank-json').setInputFiles(upload([
    schemaRecord({ id:'first' }),
    schemaRecord({ id:'second', title:'[SECOND_TITLE]', paragraphs:['[SECOND_PARAGRAPH_FIELD]'] }),
    schemaRecord({ id:'exam-two', exam:'英二' }),
  ]));
  await page.getByRole('button',{name:'选择题目',exact:true}).click();
  await page.locator('.passage-card').nth(1).click();
  await page.getByRole('button',{name:'Lingo 首页'}).click();
  await page.getByRole('button',{name:'继续 考研英语一：[SECOND_TITLE]',exact:true}).click();
  await expect(page.locator('.reading-header h1')).toHaveText('[SECOND_TITLE]');
  await page.getByRole('button',{name:'筛选 / 换题',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'筛选与选择题目'});
  await picker.getByLabel('考试范围',{exact:true}).selectOption('英二');
  await picker.locator('.passage-card').click();
  await expect(page.locator('.practice-heading .tag')).toContainText('英二');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await menu(page,'设置与角色');
  await expect(page.getByLabel('默认考试',{exact:true})).toHaveValue('英一');
});
test('写作真实来源导入、草稿保存、旧备份兼容', async ({ page }) => {
  await begin(page);
  await page
    .getByRole('navigation', { name: '学习方式' })
    .getByRole('button', { name: '写作', exact: true })
    .click();
  await page.getByRole('button', { name: '选择题目', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles(upload([schemaRecord({ id: 'writing-field', kind: 'writing', questions: [] })]));
  await page.locator('.passage-card').click();
  await page.getByLabel('我的作文').fill('[PERSONAL_ESSAY_FIELD]');
  await page.getByRole('button', { name: 'Lingo 首页' }).click();
  await page.reload();
  await begin(page);
  await page
    .getByRole('navigation', { name: '学习方式' })
    .getByRole('button', { name: '写作', exact: true })
    .click();
  await expect(page.getByLabel('我的作文')).toHaveValue('[PERSONAL_ESSAY_FIELD]');
  await expect(page.getByRole('button', { name: 'AI 写作建议' })).toBeEnabled();
});
test('拒绝生成题和缺少真题来源的导入', async ({ page }) => {
  await begin(page);
  for (const record of [
    schemaRecord({ id: 'city-gardens' }),
    schemaRecord({ source: '模拟题' }),
    schemaRecord({ provenance: undefined }),
  ]) {
    await page.locator('#bank-json').setInputFiles(upload([record]));
    await expect(page.locator('.toast[role="status"]')).toBeVisible();
    await expect(page.locator('.passage-card')).toHaveCount(0);
  }
});
test('启动迁移清理旧内容，保留个人笔记且兼容新增草稿字段', async ({ page }) => {
  const legacy = {
    ...structuredClone(defaults),
    customPassages: [schemaRecord({ id: 'city-gardens' })],
    notes: [
      {
        id: 'own-note',
        passageId: 'city-gardens',
        quote: '[USER_QUOTE]',
        body: '[PERSONAL_NOTE]',
        at: '2000-01-01',
      },
    ],
  };
  delete (legacy as Partial<typeof defaults>).writingDrafts;
  await page.evaluate(async (legacy) => {
    const { set } = await import('/node_modules/.vite/deps/idb-keyval.js');
    await set('lingo-state-v1', legacy);
  }, legacy);
  await page.reload();
  await expect(page.getByRole('heading', { name: '今天， 从一篇开始。' })).toBeVisible();
  await menu(page, '我的笔记');
  await expect(page.locator('.note-body')).toHaveText('[PERSONAL_NOTE]');
  await page.getByRole('button', { name: '返回学习' }).click();
  await expect(page.locator('.library-count')).toContainText('共 0 篇内容');
});
test('3D 模型真实加载、动作和表情驱动，无图片冒充，支持减少动态效果', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const avatar = page.locator('.vrm-avatar');
  await expect(avatar).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  await expect(avatar.locator('canvas')).toBeVisible();
  const arms = JSON.parse((await avatar.getAttribute('data-rest-arms'))!);
  expect(arms.left).toBeLessThan(-0.02);
  expect(arms.right).toBeLessThan(-0.02);
  const before = await avatar.screenshot();
  await page.getByRole('button', { name: '向角色打招呼' }).click();
  await expect(avatar).toHaveAttribute('data-mood', 'wave');
  await page.waitForTimeout(400);
  const after = await avatar.screenshot();
  expect(after.equals(before)).toBe(false);
  await page.screenshot({ path: 'test-results/focus-home.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(avatar).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('lingo-speech', { detail: true })),
  );
  await expect(avatar).toHaveAttribute('data-speaking', 'true');
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('lingo-speech', { detail: false })),
  );
  await expect(avatar).toHaveAttribute('data-speaking', 'false');
  expect(errors).toEqual([]);
});
test('开始和考试筛选键盘可用，窄屏无横向溢出', async ({ page }) => {
  await page.getByRole('button',{name:'开始学习',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('考试范围',{exact:true}).focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('考试范围',{exact:true})).toHaveValue('英一');
  await page.getByRole('button',{name:'清除筛选',exact:true}).click();
  await expect(page.getByLabel('考试范围',{exact:true})).toHaveValue('all');
  for(const width of [1080,390,375]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({path:'test-results/bank-filters-narrow-060.png',fullPage:true});
});

test('内置角色切换、动态开关、自定义 VRM 与无效模型恢复', async ({ page }) => {
  await menu(page, '设置与角色');
  const choices = page.getByRole('group', { name: '内置 3D 角色' });
  await choices.getByRole('button', { name: 'VRoid 示例女孩', exact: false }).click();
  await expect(page.locator('.vrm-avatar')).toHaveAttribute('data-ready', 'true', {
    timeout: 20000,
  });
  await expect(
    choices.getByRole('button', { name: 'VRoid 示例女孩', exact: false }),
  ).toHaveAttribute('aria-pressed', 'true');
  const arms = JSON.parse((await page.locator('.vrm-avatar').getAttribute('data-rest-arms'))!);
  expect(arms.left).toBeLessThan(-0.02);
  expect(arms.right).toBeLessThan(-0.02);
  await page.getByRole('switch', { name: '角色动态效果' }).click();
  await page.getByRole('button', { name: 'Lingo 首页' }).click();
  await page.reload();
  await menu(page, '设置与角色');
  await expect(
    choices.getByRole('button', { name: 'VRoid 示例女孩', exact: false }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('switch', { name: '角色动态效果' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  const modelInput = page.locator('input[accept*=".vrm"]');
  await modelInput.setInputFiles('assets/vivi.vrm');
  await expect(page.locator('.vrm-avatar')).toHaveAttribute('data-ready', 'true', {
    timeout: 20000,
  });
  await expect(page.getByRole('button', { name: '恢复默认 3D 动漫角色' })).toBeVisible();
  await page.getByRole('button', { name: 'Lingo 首页' }).click();
  await page.reload();
  await expect(page.locator('.vrm-avatar')).toHaveAttribute('data-ready', 'true', {
    timeout: 20000,
  });
  await menu(page, '设置与角色');
  await modelInput.setInputFiles({
    name: 'invalid.vrm',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('[INVALID_VRM_FIELD]'),
  });
  await expect(page.getByRole('alert')).toContainText('角色加载失败', { timeout: 10000 });
  await choices.getByRole('button', { name: 'Vivi', exact: false }).click();
  await expect(page.locator('.vrm-avatar')).toHaveAttribute('data-ready', 'true', {
    timeout: 20000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/avatar-settings.png', fullPage: true });
});

test('封面直接显示英语二；JSON换ID重复导入仍跳过',async({page})=>{
  await begin(page,'考研英语二');
  const p=schemaRecord({exam:'英二'});
  await page.locator('#bank-json').setInputFiles(upload([p]));
  await page.getByRole('button',{name:'选择题目',exact:true}).first().click();
  await expect(page.locator('.book-cover strong')).toHaveText('英语二');
  await page.locator('#bank-json').setInputFiles(upload([{...p,id:'different-id',title:'[RENAMED_TITLE]'}]));
  await expect(page.locator('.library-count')).toContainText('共 1 篇内容');
  await expect(page.locator('.toast[role="status"]')).toContainText('跳过 1');
  await expect(page.locator('.book-cover strong')).toHaveText('英语二');
  await page.screenshot({path:'test-results/clear-exam-cover-052.png'});
});
