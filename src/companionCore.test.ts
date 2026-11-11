import { describe, it, expect } from 'vitest';
import { advanceCare, appendCompanionTurn, CARE_INTERVAL_MS, type CareClock } from './companionCore';
describe('陪练低频关心', () => {
  it('仅在活跃学习累计20分钟后触发，并重新计时', () => {
    let clock: CareClock = { activeMs: 0, lastTick: 0, lastInput: 0 };
    for (let now = 30000; now < CARE_INTERVAL_MS; now += 30000) {
      const next = advanceCare({ ...clock, lastInput: now }, now, true, true);
      expect(next.due).toBe(false);
      clock = next.clock;
    }
    const next = advanceCare({ ...clock, lastInput: CARE_INTERVAL_MS }, CARE_INTERVAL_MS, true, true);
    expect(next.due).toBe(true);
    expect(next.clock.activeMs).toBe(0);
    expect(advanceCare(next.clock, CARE_INTERVAL_MS + 30000, true, true).due).toBe(false);
  });
  it('后台、长时间无操作和休眠不计入学习时长', () => {
    const clock = { activeMs: 30000, lastTick: 30000, lastInput: 30000 };
    expect(advanceCare(clock, 60000, false, true).clock.activeMs).toBe(30000);
    expect(advanceCare(clock, 180000, true, true).clock.activeMs).toBe(30000);
    expect(advanceCare({ ...clock, lastInput: 3600000 }, 3600000, true, true).due).toBe(false);
  });
  it('对话、录音、输入和弹窗期间延后，不补发多条', () => {
    const clock = { activeMs: CARE_INTERVAL_MS, lastTick: 0, lastInput: 30000 };
    const waiting = advanceCare(clock, 30000, true, false);
    expect(waiting.due).toBe(false);
    const next = advanceCare(waiting.clock, 60000, true, true);
    expect(next.due).toBe(true);
    expect(next.clock.activeMs).toBe(0);
  });
});

describe('本地连续对话', () => {
  it('保留最新完整长回答，并控制总历史预算', () => {
    const reply = '完整回答'.repeat(2000);
    const history = [{ role: 'user' as const, text: '旧'.repeat(1999000) }];
    const next = appendCompanionTurn(history, { role: 'assistant', text: reply });
    expect(next).toEqual([{ role: 'assistant', text: reply }]);
    expect(history).toHaveLength(1);
  });
  it('最多保留最近200条，不裁剪单条内容', () => {
    const history = Array.from({ length: 200 }, (_, index) => ({ role: 'user' as const, text: String(index) }));
    const next = appendCompanionTurn(history, { role: 'assistant', text: '最新回答' });
    expect(next).toHaveLength(200);
    expect(next[0].text).toBe('1');
    expect(next[199].text).toBe('最新回答');
  });
});
