import { useEffect, useRef, type ReactNode } from 'react';
import { X, ArrowUpRight, BookOpen, Headphones, Clock3, ChevronRight } from 'lucide-react';
import type { Passage } from './types';
import { useStudy } from './context';
import { ContentBadge } from './SourceView';
export function IconButton({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={'modal ' + (wide ? 'wide' : '')}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const rect = ref.current.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <IconButton label="关闭弹窗" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <BookOpen size={30} />
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function PassageCard({
  passage,
  compact = false,
  onDelete,
}: {
  passage: Passage;
  compact?: boolean;
  onDelete?: () => void;
}) {
  const { state, start } = useStudy();
  const draft = state.drafts[passage.id];
  return (
    <div className="passage-shell">
      <button
        className={'passage-card ' + (compact ? 'compact' : '')}
        onClick={() => start(passage)}
      >
        <div className={'book-cover cover-' + passage.exam}>
          <span>
            {passage.kind === 'listening' ? <Headphones size={20} /> : <BookOpen size={20} />}
          </span>
          <strong>
            {passage.exam === '英一' ? '英语一' : passage.exam === '英二' ? '英语二' : passage.exam}
          </strong>
          <small>
            {passage.kind === 'writing'
              ? 'Writing practice'
              : passage.kind === 'listening'
                ? 'Listening practice'
                : 'Reading practice'}
          </small>
          <i />
          <i />
          <i />
        </div>
        <div className="passage-card-body">
          <div className="row spread">
            <span className="tag">
              {passage.exam} · {passage.difficulty}
            </span>
            <ArrowUpRight size={17} />
          </div>
          <ContentBadge passage={passage} />
          <h3>{passage.title}</h3>
          <p>{passage.subtitle}</p>
          <div className="card-meta">
            <span>
              <Clock3 size={13} />
              {passage.minutes} 分钟
            </span>
            <span>
              {passage.kind === 'article'
                ? '精读文章'
                : passage.kind === 'writing'
                  ? '写作练习'
                  : passage.questions.length + ' 道题'}
            </span>
            <span>{draft?.finished ? '已完成' : draft ? '继续练习' : passage.year}</span>
          </div>
        </div>
      </button>
      {onDelete && (
        <button className="delete-passage" aria-label={'删除 ' + passage.title} onClick={onDelete}>
          移除
        </button>
      )}
    </div>
  );
}
export function SectionTitle({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ChevronRight size={15} />
    </button>
  );
}
