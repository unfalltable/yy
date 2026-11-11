import { z } from 'zod';
import limits from '../electron/import-limits.json' with { type: 'json' };
const text = z.string().min(1).max(20000);
export const ExamSchema = z.enum(['英一', '英二', 'IELTS', 'TOEFL']);
export type Exam = z.infer<typeof ExamSchema>;
export const QuestionSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    stem: text,
    options: z.array(text).min(2).max(8),
    answer: z.number().int().min(0),
    skill: text,
    explanation: text,
    evidence: text,
    hints: z.array(text).min(1).max(4),
    answerBasis: z.enum(['source', 'ai', 'user']).optional(),
  })
  .refine((q) => q.answer < q.options.length, '答案超出选项范围');
const audio = z
  .string()
  .max(30000000)
  .regex(/^data:audio\/(mpeg|mp3|wav|ogg|webm|mp4);base64,[A-Za-z0-9+/=]+$/);
export const SourceAttributionSchema = z.object({
  year: z.enum(['user', 'ai', 'unknown']),
  paper: z.enum(['user', 'ai', 'unknown']),
  reference: z.enum(['user', 'ai', 'unknown']),
  evidence: z.string().max(1000).default(''),
});
export type SourceAttribution = z.infer<typeof SourceAttributionSchema>;
export const PassageSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    exam: ExamSchema,
    title: z.string().min(1).max(200),
    subtitle: z.string().max(200),
    kind: z.enum(['reading', 'listening', 'writing', 'article']),
    year: z.string().max(30),
    source: z.string().max(500),
    difficulty: z.enum(['基础', '进阶', '挑战']),
    minutes: z.number().min(1).max(180),
    paragraphs: z.array(text).min(1).max(80),
    questions: z.array(QuestionSchema).max(50),
    audio: audio.optional(),
    materialId: z.string().max(100).optional(),
    adapted: z.boolean().optional(),
    provenance: z
      .object({
        kind: z.enum(['past-paper', 'practice', 'article', 'ai-generated']),
        paper: z.string().min(1).max(300),
        reference: z.string().min(1).max(1000),
        metadata: SourceAttributionSchema.optional(),
      })
      .optional(),
  })
  .superRefine((p, ctx) => {
    if (!['writing', 'article'].includes(p.kind) && !p.questions.length)
      ctx.addIssue({ code: 'custom', message: '阅读和听力至少包含一道题' });
    if (new Set(p.questions.map((q) => q.id)).size !== p.questions.length)
      ctx.addIssue({ code: 'custom', message: '题目 ID 重复' });
  });
export type Passage = z.infer<typeof PassageSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export const BankSchema = z
  .object({
    version: z.literal(1),
    contentType: z.enum(['past-paper', 'personal-bank']),
    passages: z.array(PassageSchema).min(1).max(500),
  })
  .superRefine((b, ctx) => {
    if (new Set(b.passages.map((p) => p.id)).size !== b.passages.length)
      ctx.addIssue({ code: 'custom', message: '篇目 ID 重复' });
  });
export const AttemptSchema = z.object({
  id: z.string(),
  passageId: z.string(),
  questionId: z.string(),
  selected: z.number().int().min(0),
  correct: z.boolean(),
  skill: z.string(),
  seconds: z.number().min(0),
  hints: z.number().min(0),
  at: z.string(),
  reason: z.string().optional(),
});
export type Attempt = z.infer<typeof AttemptSchema>;
const NoteSchema = z.object({
  id: z.string(),
  passageId: z.string(),
  quote: z.string().max(2000),
  body: z.string().max(20000),
  at: z.string(),
  paragraph: z.number().int().min(0).optional(),
});
export type Note = z.infer<typeof NoteSchema>;
const WordSchema = z.object({
  id: z.string(),
  word: z.string(),
  meaning: z.string(),
  context: z.string(),
  at: z.string(),
  due: z.string(),
  level: z.number().int().min(0).max(8),
});
export type Word = z.infer<typeof WordSchema>;
const DraftSchema = z.object({
  answers: z.record(z.string(), z.number().int().min(0)),
  hints: z.record(z.string(), z.number().min(0)),
  seconds: z.number().min(0),
  index: z.number().int().min(0),
  finished: z.boolean(),
  checked: z.array(z.string()),
  times: z.record(z.string(), z.number().min(0)),
});
export type Draft = z.infer<typeof DraftSchema>;
export const SettingsSchema = z
  .object({
    exam: ExamSchema,
    dailyGoal: z.number().int().min(5).max(180),
    track: z.boolean(),
    reminders: z.boolean(),
    speech: z.boolean(),
    fontSize: z.number().min(16).max(24),
    companionName: z.string().min(1).max(20),
    avatarMotion: z.boolean().default(true),
    companionCare: z.boolean().default(true),
    companionStyle: z.enum(['gentle', 'active']).default('gentle'),
    builtinAvatar: z.enum(['avatar-b', 'seed', 'momo', 'vivi']).default('avatar-b'),
    avatarType: z.enum(['default', 'image', 'vrm']),
    avatar: z.string().max(45000000),
    aiEndpoint: z.string().max(1000),
    aiModel: z.string().max(200),
    visionModel: z.string().max(200).default(''),
    asrModel: z.string().max(200),
  })
  .superRefine((s, ctx) => {
    if (
      s.avatarType === 'image' &&
      !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s.avatar)
    )
      ctx.addIssue({ code: 'custom', message: '角色图片格式不正确' });
    if (
      s.avatarType === 'vrm' &&
      !/^data:(application\/(octet-stream|x-vrm|vrm)|model\/gltf-binary)?;base64,[A-Za-z0-9+/=]+$/.test(
        s.avatar,
      )
    )
      ctx.addIssue({ code: 'custom', message: 'VRM 文件格式不正确' });
  });
export type Settings = z.infer<typeof SettingsSchema>;
export const MaterialSchema = z.object({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  format: z.enum(['pdf', 'image', 'word', 'text']).optional(),
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(300),
  text: z.string().max(100000),
  images: z
    .array(
      z.object({
        name: z.string().max(300),
        url: z
          .string()
          .max(4000000)
          .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
        page: z.number().int().min(1).optional(),
      }),
    )
    .max(Math.max(limits.pdfPages, limits.images)),
  at: z.string(),
});
export type SourceMaterial = z.infer<typeof MaterialSchema>;
export const CompanionSessionSchema = z.object({
  id: z.string().min(1).max(100),
  startedAt: z.string(),
  targetMinutes: z.number().int().min(5).max(180),
  activeSeconds: z.number().min(0).max(10800),
  status: z.enum(['running', 'paused', 'completed', 'ended']),
  notices: z.array(z.enum(['quarter', 'half', 'three-quarter', 'complete'])).max(4).default([]),
});
export type CompanionSession = z.infer<typeof CompanionSessionSchema>;
export const StateSchema = z.object({
  version: z.literal(1),
  companionSession: CompanionSessionSchema.nullable().default(null),
  companionHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'error']),
    text: z.string().max(2000000),
    context: z.string().max(300).optional(),
  })).max(200).default([]),
  attempts: z.array(AttemptSchema).max(200000),
  notes: z.array(NoteSchema).max(20000),
  words: z.array(WordSchema).max(20000),
  materials: z.array(MaterialSchema).max(200).default([]),
  customPassages: z.array(PassageSchema).max(500),
  drafts: z.record(z.string(), DraftSchema),
  writingDrafts: z
    .record(
      z.string(),
      z.object({
        text: z.string().max(30000),
        feedback: z.string().max(30000),
        updatedAt: z.string(),
      }),
    )
    .default({}),
  activity: z.record(z.string(), z.number().min(0)),
  settings: SettingsSchema,
});
export type AppState = z.infer<typeof StateSchema>;
export const defaults: AppState = {
  version: 1,
  companionHistory: [],
  companionSession: null,
  attempts: [],
  notes: [],
  words: [],
  materials: [],
  customPassages: [],
  drafts: {},
  writingDrafts: {},
  activity: {},
  settings: {
    exam: '英一',
    dailyGoal: 25,
    track: true,
    reminders: true,
    speech: false,
    fontSize: 18,
    companionName: 'Momo',
    avatarMotion: true,
    companionCare: true,
    companionStyle: 'gentle',
    builtinAvatar: 'avatar-b',
    avatarType: 'default',
    avatar: '',
    aiEndpoint: '',
    aiModel: '',
    visionModel: '',
    asrModel: '',
  },
};
export type Page =
  | 'home'
  | 'library'
  | 'practice'
  | 'mistakes'
  | 'notes'
  | 'words'
  | 'speaking'
  | 'insights'
  | 'settings'
  | 'writing'
  | 'article';
export type Skill = 'reading' | 'listening' | 'speaking' | 'writing';
declare global {
  interface Window {
    desktop?: {
      isDesktop: boolean;
      nativeWindowControls?: boolean;
      onBeforeClose?: (callback: () => void) => () => void;
      closeReady?: () => void;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      saveKey: (key: string) => Promise<void>;
      hasKey: () => Promise<boolean>;
      ai: (data: {
        endpoint: string;
        model: string;
        prompt: string;
        images?: string[];
        materialFormat?: SourceMaterial['format'];
        task?: 'bank-import';
        requestId?: string;
      }) => Promise<string>;
      cancelAi: (id: string) => Promise<void>;
      extractDocument: (data: {
        name: string;
        base64: string;
      }) => Promise<{ text: string; images: { name: string; url: string }[]; warnings: string[] }>;
      transcribe: (data: {
        endpoint: string;
        model: string;
        audio: string;
        mime: string;
      }) => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      exportFile: (data: { name: string; content: string }) => Promise<boolean>;
    };
  }
}
