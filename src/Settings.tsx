import { useEffect, useState } from 'react';
import {
  Check,
  Download,
  ExternalLink,
  ImagePlus,
  KeyRound,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { useStudy } from './context';
import { builtinAvatars } from './avatars';
import { Modal, SectionTitle } from './ui';
import { exportJson, openLink } from './storage';
import { parseBackup } from './core';
import { examNames } from './data';
import type { AppState, Exam, Settings as SettingsType } from './types';
export default function Settings() {
  const { state, update, toast } = useStudy();
  const s = state.settings;
  const [key, setKey] = useState(''),
    [hasKey, setHasKey] = useState(false),
    [saving, setSaving] = useState(false),
    [backup, setBackup] = useState<AppState | null>(null),
    [endpoint, setEndpoint] = useState(s.aiEndpoint),
    [model, setModel] = useState(s.aiModel),
    [asr, setAsr] = useState(s.asrModel),
    [vision, setVision] = useState(s.visionModel),
    [testing, setTesting] = useState(false);
  useEffect(() => {
    window.desktop
      ?.hasKey()
      .then(setHasKey)
      .catch(() => {});
  }, []);
  function change<K extends keyof SettingsType>(key: K, value: SettingsType[K]) {
    update((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));
  }
  async function avatar(file: File) {
    try {
      const type = file.name.toLowerCase().endsWith('.vrm') ? 'vrm' : 'image';
      if (
        type === 'image' &&
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)
      )
        throw Error('请选择 PNG、JPG、WebP、GIF 或 VRM 文件');
      if (file.size > (type === 'vrm' ? 30000000 : 5000000))
        throw Error(type === 'vrm' ? 'VRM 请控制在 30 MB 内' : '图片请控制在 5 MB 内');
      const data = await new Promise<string>((res, rej) => {
        const f = new FileReader();
        f.onload = () => res(f.result as string);
        f.onerror = rej;
        f.readAsDataURL(file);
      });
      update((s) => ({ ...s, settings: { ...s.settings, avatarType: type, avatar: data } }));
      toast('角色已更新');
    } catch (e) {
      toast(e instanceof Error ? e.message : '读取角色失败');
    }
  }
  async function saveService() {
    try {
      if (endpoint.trim()) {
        const u = new URL(endpoint.trim());
        if (
          u.username ||
          u.password ||
          u.search ||
          u.hash ||
          !(
            u.protocol === 'https:' ||
            (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
          )
        )
          throw Error('请使用 HTTPS 或本机 HTTP 地址，且不包含账号与参数');
      }
      setSaving(true);
      if (key.trim()) {
        if (!window.desktop) throw Error('密钥仅可在桌面应用中加密保存');
        await window.desktop.saveKey(key.trim());
        setHasKey(true);
        setKey('');
      }
      update((s) => ({
        ...s,
        settings: {
          ...s.settings,
          aiEndpoint: endpoint.trim().replace(/\/$/, ''),
          aiModel: model.trim(),
          asrModel: asr.trim(),
          visionModel: vision.trim(),
        },
      }));
      toast('服务设置已保存');
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }
  async function testService() {
    if (!window.desktop) {
      toast('请使用桌面版连接 AI 服务');
      return;
    }
    setTesting(true);
    try {
      const text = await window.desktop.ai({
        endpoint: s.aiEndpoint,
        model: s.aiModel,
        prompt: '请仅回复：连接成功',
      });
      toast('服务连接成功：' + text.slice(0, 50));
    } catch (e) {
      toast(e instanceof Error ? e.message : '连接失败');
    } finally {
      setTesting(false);
    }
  }
  async function readBackup(file: File) {
    try {
      if (file.size > 200000000) throw Error('备份请控制在 200 MB 内');
      setBackup(parseBackup(await file.text()));
    } catch {
      toast('备份格式不正确，当前记录未受影响');
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="greeting">把学习空间，调成喜欢的样子</div>
          <h1>偏好设置</h1>
          <p>学习偏好自动保存。云端服务由你选择，数据由你掌握。</p>
        </div>
      </div>
      <div className="settings-grid">
        <div>
          <section className="panel settings-section">
            <SectionTitle title="学习节奏" detail="选一个能坚持的小目标。" />
            <label className="setting-row">
              <div>
                <strong>默认考试</strong>
                <p>新资料导入时的默认类型；题库可跨考试筛选与练习</p>
              </div>
              <select
                aria-label="默认考试"
                value={s.exam}
                onChange={(e) => change('exam', e.target.value as Exam)}
              >
                {(Object.keys(examNames) as Exam[]).map((exam) => (
                  <option key={exam} value={exam}>
                    {examNames[exam]}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-row">
              <div>
                <strong>每日专注目标</strong>
                <p>按实际活跃练习时间累计</p>
              </div>
              <select
                aria-label="每日专注目标"
                value={s.dailyGoal}
                onChange={(e) => change('dailyGoal', Number(e.target.value))}
              >
                {[10, 15, 25, 30, 45, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} 分钟
                  </option>
                ))}
              </select>
            </label>
            <Toggle
              title="记录学习习惯"
              detail="控制活跃练习时间统计；答题用时和提示随进度保存"
              value={s.track}
              onChange={(v) => change('track', v)}
            />
            <Toggle
              title="卡题时温柔提醒"
              detail="当前题思考超过约 2 分半时提示一次"
              value={s.reminders}
              onChange={(v) => change('reminders', v)}
            />
            <Toggle
              title="陪练语音"
              detail="答题反馈可朗读；提示中文需本机中文语音包"
              value={s.speech}
              onChange={(v) => change('speech', v)}
            />
          </section>
          <section className="panel settings-section">
            <SectionTitle
              title="AI 与语音服务"
              detail="支持兼容 Chat Completions / Audio Transcriptions 的服务。"
            />
            <div className="callout">
              点击 AI
              分析、联网翻译、语音识别或资料提取/出题时，才会发送对应统计、词句、录音或本批学习资料。配置前，基础刷题、解析、笔记和离线词典可正常使用。
            </div>
            <label className="field">
              服务基础地址
              <input
                placeholder="https://你的服务地址/v1"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                maxLength={1000}
              />
            </label>
            <div className="two-fields">
              <label className="field">
                对话模型
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="服务商提供的模型名称"
                  maxLength={200}
                />
              </label>
              <label className="field">
                语音识别模型
                <input
                  value={asr}
                  onChange={(e) => setAsr(e.target.value)}
                  placeholder="可选，需支持音频转写"
                  maxLength={200}
                />
              </label>
            </div>
            <label className="field">
              图片识别模型（可选）
              <input
                aria-label="图片识别模型"
                value={vision}
                maxLength={200}
                onChange={(e) => setVision(e.target.value)}
                placeholder="留空使用对话模型，识别照片和扫描页需支持图片"
              />
              <span className="small-text muted">用于提取照片、扫描版PDF和Word图片中的题目。</span>
            </label>
            <label className="field">
              服务密钥{' '}
              {hasKey && (
                <span className="key-status">
                  <ShieldCheck size={13} />
                  已由系统加密保存
                </span>
              )}
              <input
                autoComplete="off"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  window.desktop ? '输入后使用 Windows 加密存储' : '请在桌面应用中配置密钥'
                }
                disabled={!window.desktop}
                maxLength={2000}
              />
            </label>
            <div className="row wrap">
              <button className="primary" disabled={saving} onClick={saveService}>
                <Save size={16} />
                {saving ? '正在保存…' : '保存服务设置'}
              </button>
              <button
                className="secondary"
                disabled={testing || !s.aiEndpoint || !s.aiModel}
                onClick={testService}
              >
                {testing ? '连接中…' : '测试已保存的配置'}
              </button>
              {hasKey && (
                <button
                  className="text-link danger-text"
                  onClick={async () => {
                    try {
                      await window.desktop?.saveKey('');
                      setHasKey(false);
                      toast('密钥已移除');
                    } catch {
                      toast('移除失败');
                    }
                  }}
                >
                  <Trash2 size={14} />
                  移除密钥
                </button>
              )}
            </div>
            <p className="small-text muted">
              密钥不会进入学习备份、网页存储或应用日志。ASR
              与对话共用此服务地址和密钥。联网服务可能产生费用。
            </p>
          </section>
          <section className="panel settings-section">
            <SectionTitle
              title="备份与迁移"
              detail="备份包含学习记录、题库和自定义角色，不含服务密钥。"
            />
            <div className="row">
              <button
                className="secondary"
                onClick={() =>
                  exportJson(
                    'lingo-backup-' + new Date().toISOString().slice(0, 10) + '.json',
                    state,
                  )
                    .then((saved) => saved && toast('备份已导出'))
                    .catch(() => toast('备份导出失败'))
                }
              >
                <Download size={16} />
                导出完整备份
              </button>
              <label className="secondary file-button">
                <Upload size={16} />
                恢复备份
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void readBackup(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <p className="small-text muted">
              本地数据保存在应用专用目录。便携版移动程序位置通常不影响记录，更换电脑请先导出备份。
            </p>
          </section>
        </div>
        <aside>
          <section className="panel settings-section avatar-settings">
            <SectionTitle
              title="你的陪练角色"
              detail="选择模型即可在右下角预览；支持自然待机、说话手势和学习反馈。"
            />
            <p className="callout">右下角角色即为实时预览，切换页面也会一直陪着你。</p>
            <div className="builtin-avatars" role="group" aria-label="内置 3D 角色">
              {builtinAvatars.map((a) => (
                <button
                  key={a.id}
                  aria-pressed={s.avatarType === 'default' && s.builtinAvatar === a.id}
                  className={
                    s.avatarType === 'default' && s.builtinAvatar === a.id ? 'selected' : ''
                  }
                  onClick={() =>
                    update((s) => ({
                      ...s,
                      settings: {
                        ...s.settings,
                        avatarType: 'default',
                        avatar: '',
                        builtinAvatar: a.id,
                      },
                    }))
                  }
                >
                  <img src={a.preview} alt="" width={160} height={140} loading="lazy" />
                  <strong>{a.name}</strong>
                  <span>{a.detail}</span>
                  <small>{a.license}</small>
                </button>
              ))}
            </div>
            <p className="small-text muted avatar-credit">
              模型：
              {s.avatarType === 'default'
                ? builtinAvatars.find((a) => a.id === s.builtinAvatar)?.author
                : '用户上传'}
              。内置角色已打包，可离线使用。
            </p>
            <label className="field">
              陪练名字
              <input
                aria-label="陪练名字"
                maxLength={20}
                value={s.companionName}
                onChange={(e) => {
                  if (e.target.value.trim()) change('companionName', e.target.value);
                }}
              />
            </label>
            <label className="field">
              陪学提醒风格
              <select aria-label="陪学提醒风格" value={s.companionStyle} onChange={e => change('companionStyle', e.target.value as 'gentle' | 'active')}>
                <option value="gentle">温和陪伴</option>
                <option value="active">更主动的目标督促</option>
              </select>
            </label>
            <Toggle
              title="陪练关心提醒"
              detail="活跃学习约20分钟后，轻声提醒喝水、放松；文字提醒不调用AI"
              value={s.companionCare}
              onChange={(v) => change('companionCare', v)}
            />
            <Toggle
              title="角色动态效果"
              detail="真实动作、手势、眨眼和鼠标视线；遵循系统减少动态效果设置"
              value={s.avatarMotion}
              onChange={(v) => change('avatarMotion', v)}
            />
            <label className="secondary file-button">
              <ImagePlus size={17} />
              上传图片 / GIF / VRM
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.gif,.vrm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void avatar(f);
                  e.target.value = '';
                }}
              />
            </label>
            <p className="small-text muted">
              图片 ≤ 5 MB，VRM ≤ 30 MB。PNG 可带透明背景；GIF 保留动画；VRM
              支持呼吸、眨眼、视线、挥手和学习表情。角色实际表情取决于模型。
            </p>
            {s.avatarType !== 'default' && (
              <button
                className="text-link"
                onClick={() =>
                  update((s) => ({
                    ...s,
                    settings: { ...s.settings, avatarType: 'default', avatar: '' },
                  }))
                }
              >
                恢复默认 3D 动漫角色
              </button>
            )}
          </section>
          <section className="panel settings-section">
            <SectionTitle title="更精致的角色" detail="按外观与动作表现筛选；付费角色需自行获取，下载后上传VRM即可预览。" />
            <Resource
              title="Manuka · 精细动漫角色"
              detail="STUDIO JINGO · 付费，附VRM文件，丰富表情与视线、口型"
              url="https://booth.pm/zh-cn/items/5058077"
            />
            <Resource
              title="Shinano · 柔和动漫角色"
              detail="ポンデロニウム研究所 · 付费VRChat角色，需另导出VRM"
              url="https://ponderogen.booth.pm/items/6106863"
            />
            <Resource
              title="Vivi · CC0 动漫模型"
              detail="pixiv 官方开放模型，可修改与再分发"
              url="https://vroid.pixiv.help/hc/en-us/articles/360014900273"
            />
            <Resource
              title="VRoid Hub"
              detail="寻找 VRM 角色，按作者许可使用"
              url="https://hub.vroid.com/"
            />
            <Resource
              title="VRM 标准"
              detail="可移植的 3D 角色格式，内含许可信息"
              url="https://vrm.dev/en/vrm/vrm_features/"
            />
            <Resource
              title="蓝色大肥鱼 · 原作者发布页"
              detail="木子恶魔作品，按原作者条款获取 VRM 后上传"
              url="https://www.aplaybox.com/details/model/ayXkRzVflmnd"
            />
            <Resource
              title="Live2D Cubism"
              detail="2D 动态角色方案，本版尚未集成"
              url="https://www.live2d.com/en/sdk/about/"
            />
            <p className="small-text muted">
              内置VRoid B与旧示例保留pixiv模型条款；Seed-san model by VirtualCast, Inc.，遵循VRM Public License 1.0；Vivi为CC0。
              动作来自sashii及へすい/rerofumi的CC0作品。付费模型未内置，上传VRM最多30MB；图片和GIF是2D形象。
            </p>
          </section>
        </aside>
      </div>
      {backup && (
        <Modal title="恢复这份学习备份？" onClose={() => setBackup(null)}>
          <p>将用备份替换当前应用内的学习记录与偏好：</p>
          <div className="backup-preview">
            <span>{backup.attempts.length} 次作答</span>
            <span>{backup.notes.length} 条笔记</span>
            <span>{backup.words.length} 个生词</span>
            <span>{backup.customPassages.length} 篇导入题目</span>
          </div>
          <p className="callout">
            点击下方按钮会先导出当前记录，成功后再恢复。服务密钥保留在此设备的系统加密存储中。
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setBackup(null)}>
              取消
            </button>
            <button
              className="primary"
              onClick={async () => {
                try {
                  const saved = await exportJson('lingo-before-restore.json', state);
                  if (!saved) return;
                  update(() => backup);
                  setEndpoint(backup.settings.aiEndpoint);
                  setModel(backup.settings.aiModel);
                  setAsr(backup.settings.asrModel);
                  setBackup(null);
                  toast('备份已恢复');
                } catch {
                  toast('恢复失败，当前记录未替换');
                }
              }}
            >
              备份当前并恢复
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Toggle({
  title,
  detail,
  value,
  onChange,
}: {
  title: string;
  detail: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <button
        className={'toggle ' + (value ? 'on' : '')}
        role="switch"
        aria-checked={value}
        aria-label={title}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  );
}
function Resource({ title, detail, url }: { title: string; detail: string; url: string }) {
  const { toast } = useStudy();
  return (
    <button className="resource-link" onClick={() => openLink(url).catch((e) => toast(e.message))}>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <ExternalLink size={16} />
    </button>
  );
}
