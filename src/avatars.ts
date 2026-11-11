import avatarBPreview from '../assets/avatar-b-preview.webp';
import seedPreview from '../assets/seed-preview.webp';
import viviPreview from '../assets/vivi-preview.webp';
import momoPreview from '../assets/momo-preview.webp';
import avatarB from '../assets/avatar-b.vrm?url';
import seed from '../assets/seed.vrm?url';
import momo from '../assets/momo.vrm?url';
import vivi from '../assets/vivi.vrm?url';
export const builtinAvatars = [
  {
    id: 'avatar-b', name: 'VRoid B · 精细动漫', detail: '细腻贴图、发丝与完整表情',
    author: 'VRoid Project / pixiv Inc.', license: 'VRoid 模型条款',
    source: 'https://vroid.pixiv.help/hc/en-us/articles/4402394424089', url: avatarB, preview: avatarBPreview,
  },
  {
    id: 'seed', name: 'Seed · 机能动漫', detail: '机能服饰、材质与表情联动',
    author: 'Seed-san model by VirtualCast, Inc.', license: 'VRM Public License 1.0',
    source: 'https://github.com/vrm-c/vrm-specification/tree/master/samples/Seed-san', url: seed, preview: seedPreview,
  },
  {
    id: 'vivi',
    name: 'Vivi',
    detail: '短发动漫女孩',
    author: 'VRoid Project / pixiv Inc.',
    license: 'CC0',
    source: 'https://vroid.pixiv.help/hc/en-us/articles/360014900273',
    url: vivi, preview: viviPreview,
  },
  {
    id: 'momo',
    name: 'VRoid 示例女孩',
    detail: '休闲服饰动漫角色',
    author: 'pixiv Inc.',
    license: 'VRM Public License 1.0',
    source: 'https://github.com/pixiv/three-vrm',
    url: momo, preview: momoPreview,
  },
] as const;

export type BuiltinAvatarId = (typeof builtinAvatars)[number]['id'];
