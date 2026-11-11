import { test, expect, type Page } from '@playwright/test';
import { defaults } from '../src/types';

async function menu(page: Page, name: string) {
  await page.getByRole('button', { name: '学习记录与设置', exact: true }).click();
  await page.getByRole('navigation', { name: '学习记录与设置' }).getByRole('button', { name, exact: true }).click();
}
async function begin(page: Page) {
  await page.getByRole('button', { name: '开始学习', exact: true }).click();

}

test('固定右下角，切换页面保留同一个3D实例和聊天草稿', async ({ page }) => {
  await page.goto('/');
  const widget = page.locator('.companion-floating');
  const avatar = page.locator('.vrm-avatar');
  await expect(avatar).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  await avatar.evaluate((element) => { (element as HTMLElement).dataset.instance = 'persistent'; });
  const box = await widget.boundingBox();
  const rightGap = 1480 - box!.x - box!.width;
  expect(rightGap).toBeGreaterThanOrEqual(20);
  expect(rightGap).toBeLessThanOrEqual(30);
  expect(box!.y + box!.height).toBe(944);
  await page.getByRole('button', { name: '问陪练', exact: true }).click();
  await page.getByLabel('问陪练的问题').fill('还没发的草稿');
  await begin(page);
  await page.getByRole('navigation', { name: '学习方式' }).getByRole('button', { name: '写作', exact: true }).click();
  for (const name of ['我的笔记', '学习报告', '设置与角色']) {
    await menu(page, name);
    await expect(avatar).toHaveAttribute('data-instance', 'persistent');
    await expect(page.locator('.vrm-avatar canvas')).toHaveCount(1);
    expect(await widget.boundingBox()).toEqual(box);
    await expect(page.getByLabel('问陪练的问题')).toHaveValue('还没发的草稿');
  }
  await page.getByRole('button', { name: '收起对话' }).click();
  await page.getByRole('button', { name: '问陪练', exact: true }).click();
  await expect(page.getByLabel('问陪练的问题')).toHaveValue('还没发的草稿');
  await page.screenshot({ path: 'test-results/companion-persistent-settings.png', fullPage: false });
});

test('等待AI时切页仍收到完整回答，第二轮携带上一轮对话', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'desktop', { configurable: true, value: {
      isDesktop: true,
      hasKey: async () => false,
      ai: async ({ prompt }: { prompt: string }) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        if (prompt.includes('用户本次问题：第二个问题')) {
          return prompt.includes('第一个问题') && prompt.includes('第一轮回答')
            ? '已接上第一轮的内容，继续回答。' : '上下文丢失';
        }
        return '第一轮回答：' + '保留完整内容。'.repeat(900) + '[完整结束]';
      },
    } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天， 从一篇开始。' })).toBeVisible();
  await page.evaluate(async (state) => {
    const { set } = await import('/node_modules/.vite/deps/idb-keyval.js');
    await set('lingo-state-v1', state);
  }, { ...structuredClone(defaults), settings: { ...defaults.settings, aiEndpoint: 'http://127.0.0.1:12345/v1', aiModel: 'mock' } });
  await page.reload();
  await page.getByRole('button', { name: '问陪练', exact: true }).click();
  await page.getByLabel('问陪练的问题').fill('第一个问题');
  await page.getByRole('button', { name: '发送问题' }).click();
  await begin(page);
  await page.getByRole('navigation', { name: '学习方式' }).getByRole('button', { name: '写作', exact: true }).click();
  await expect(page.getByLabel('陪练完整回答')).toContainText('[完整结束]');
  expect((await page.getByLabel('陪练完整回答').textContent())!.length).toBeGreaterThan(5000);
  expect((await page.locator('.companion-line').textContent())!.length).toBeLessThan(250);
  await page.getByRole('button', { name: '收起陪练气泡' }).click();
  await expect(page.getByLabel('陪练完整回答')).toContainText('[完整结束]');
  await page.getByLabel('问陪练的问题').fill('第二个问题');
  await page.getByRole('button', { name: '发送问题' }).click();
  await menu(page, '我的笔记');
  await expect(page.getByLabel('陪练完整回答').last()).toHaveText('已接上第一轮的内容，继续回答。');
  await expect(page.locator('.companion-turn.user')).toHaveCount(2);
  await expect(page.getByLabel('陪练完整回答')).toHaveCount(2);
  await page.waitForTimeout(350);
  await page.reload();
  await page.getByRole('button', { name: '问陪练', exact: true }).click();
  await expect(page.getByLabel('陪练完整回答')).toHaveCount(2);
  await page.getByLabel('问陪练的问题').fill('第二个问题');
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect(page.getByLabel('陪练完整回答').last()).toHaveText('已接上第一轮的内容，继续回答。');
  await page.setViewportSize({ width: 390, height: 960 });
  const panel = await page.getByLabel('陪练对话', { exact: true }).boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
  expect(panel!.y).toBeGreaterThan(64);
  await page.screenshot({ path: 'test-results/companion-continuous-chat.png', fullPage: false });
});

test('关心提醒可关闭，重启页面保留选择', async ({ page }) => {
  await page.goto('/');
  await menu(page, '设置与角色');
  const toggle = page.getByRole('switch', { name: '陪练关心提醒' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await page.waitForTimeout(300);
  await page.reload();
  await menu(page, '设置与角色');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});
