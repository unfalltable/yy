import { get, getMany, setMany } from 'idb-keyval';
import { useCallback, useEffect, useRef, useState } from 'react';
import { defaults, StateSchema, type AppState } from './types';
import { removeRetiredContent } from './retiredContent';
let queue: Promise<void> = Promise.resolve();
const mediaCache = new Map<string, string>();
type Stored = AppState & { mediaKeys?: string[] };
async function hydrate(raw: Stored): Promise<AppState> {
  const stored = {
    ...raw,
    settings: { ...raw.settings },
    materials: (raw.materials ?? []).map((m) => ({
      ...m,
      images: m.images.map((i) => ({ ...i })),
    })),
    customPassages: raw.customPassages.map((p) => ({ ...p })),
  };
  const refs = [
    stored.settings.avatar,
    ...stored.customPassages.map((p) => p.audio ?? ''),
    ...stored.materials.flatMap((m) => m.images.map((i) => i.url)),
  ].filter((x) => x.startsWith('@asset:'));
  const values = await getMany(refs);
  const lookup = new Map<string, string>();
  refs.forEach((key, index) => {
    const value = values[index];
    if (typeof value !== 'string') throw Error('媒体文件缺失');
    lookup.set(key, value);
    mediaCache.set(key, value);
  });
  if (stored.settings.avatar.startsWith('@asset:'))
    stored.settings.avatar = lookup.get(stored.settings.avatar)!;
  for (const p of stored.customPassages)
    if (p.audio?.startsWith('@asset:')) p.audio = lookup.get(p.audio)!;
  for (const m of stored.materials)
    for (const i of m.images) if (i.url.startsWith('@asset:')) i.url = lookup.get(i.url)!;
  return StateSchema.parse(stored);
}
async function persist(state: AppState) {
  const nextMedia = new Map<string, string>();
  const avatarKey = '@asset:avatar';
  if (state.settings.avatar) nextMedia.set(avatarKey, state.settings.avatar);
  const customPassages = state.customPassages.map((p) => {
    if (!p.audio) return p;
    const key = '@asset:audio:' + p.id;
    nextMedia.set(key, p.audio);
    return { ...p, audio: key };
  });
  const materials = state.materials.map((m) => ({
    ...m,
    images: m.images.map((i, index) => {
      const key = '@asset:material:' + m.id + ':' + index;
      nextMedia.set(key, i.url);
      return { ...i, url: key };
    }),
  }));
  const snapshot = {
    ...state,
    settings: { ...state.settings, avatar: state.settings.avatar ? avatarKey : '' },
    customPassages,
    materials,
    mediaKeys: [...nextMedia.keys()],
  };
  const entries: [IDBValidKey, unknown][] = [['lingo-state-v1', snapshot]];
  for (const [key, value] of nextMedia)
    if (mediaCache.get(key) !== value) entries.push([key, value]);
  for (const key of mediaCache.keys()) if (!nextMedia.has(key)) entries.push([key, null]);
  await setMany(entries);
  mediaCache.clear();
  for (const [key, value] of nextMedia) mediaCache.set(key, value);
}
export function useAppState() {
  const [state, setState] = useState<AppState>(structuredClone(defaults)),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const first = useRef(true);
  useEffect(() => {
    get('lingo-state-v1')
      .then(async (raw) => {
        if (raw !== undefined) {
          try {
            const loaded = await hydrate(raw);
            const cleaned = removeRetiredContent(loaded);
            if (cleaned !== loaded) await persist(cleaned);
            setState(cleaned);
          } catch {
            setError('本地数据格式不兼容或媒体缺失。原数据已保留，请导出诊断备份后处理。');
            return;
          }
        }
        setReady(true);
      })
      .catch(() => setError('无法读取本地数据库，请检查磁盘空间和应用权限。'));
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (first.current) {
      first.current = false;
      return;
    }
    queue = queue
      .catch(() => {})
      .then(() => persist(state))
      .catch(() => setError('保存失败，请立即导出备份并检查磁盘空间。'));
  }, [state, ready]);
  const update = useCallback((fn: (s: AppState) => AppState) => setState(fn), []);
  return { state, update, ready, error };
}
export async function flushStorage() {
  await queue;
}
export async function exportJson(name: string, data: unknown) {
  const content = JSON.stringify(data, null, 2);
  if (window.desktop) return window.desktop.exportFile({ name, content });
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
export async function openLink(url: string) {
  if (window.desktop) return window.desktop.openExternal(url);
  window.open(url, '_blank', 'noopener,noreferrer');
}
