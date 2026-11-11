export const CARE_INTERVAL_MS = 20 * 60 * 1000;
export type CareClock = { activeMs: number; lastTick: number; lastInput: number };
export function advanceCare(clock: CareClock, now: number, active: boolean, canSpeak: boolean) {
  const elapsed = now - clock.lastTick;
  const engaged = active && now - clock.lastInput <= 2 * 60 * 1000 && elapsed >= 0 && elapsed <= 90000;
  const activeMs = clock.activeMs + (engaged ? elapsed : 0);
  const due = engaged && canSpeak && activeMs >= CARE_INTERVAL_MS;
  return { clock: { ...clock, lastTick: now, activeMs: due ? 0 : activeMs }, due };
}

export type CompanionTurn = { role: 'user' | 'assistant' | 'error'; text: string; context?: string };
export function appendCompanionTurn(history: CompanionTurn[], turn: CompanionTurn) {
  const next = [...history, turn];
  let chars = next.reduce((sum, item) => sum + item.text.length, 0);
  while (next.length > 200 || (chars > 2000000 && next.length > 1)) {
    chars -= next.shift()!.text.length;
  }
  return next;
}
