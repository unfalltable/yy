import { lazy, Suspense } from 'react';
import type { Settings } from './types';
import type { Mood } from './VrmAvatar';
const VrmAvatar = lazy(() => import('./VrmAvatar'));
export function Mascot({
  settings,
  small = false,
  mood = 'idle',
}: {
  settings?: Settings;
  small?: boolean;
  mood?: Mood;
}) {
  if (settings?.avatarType === 'image' && settings.avatar)
    return (
      <img
        className={'custom-mascot ' + (small ? 'small' : '')}
        src={settings.avatar}
        alt={settings.companionName + ' 的自定义图片形象'}
      />
    );
  return (
    <Suspense fallback={<span className="avatar-loading">正在加载 3D 角色…</span>}>
      <VrmAvatar
        data={settings?.avatarType === 'vrm' ? settings.avatar : ''}
        small={small}
        mood={mood}
        variant={settings?.builtinAvatar ?? 'avatar-b'}
        motion={settings?.avatarMotion ?? true}
      />
    </Suspense>
  );
}
