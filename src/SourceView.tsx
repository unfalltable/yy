import { useStudy } from './context';
import type { Passage } from './types';
import { originName } from './importCore';
export function ContentBadge({ passage }: { passage: Passage }) {
  return (
    <span className={'content-origin origin-' + (passage.provenance?.kind ?? 'past-paper')}>
      {originName(passage)}
      {passage.provenance?.kind === 'past-paper' && passage.provenance.metadata &&
        (['year','paper','reference'] as const).some(key => passage.provenance!.metadata![key] !== 'user') ? ' · 来源待核实' : ''}
      {passage.adapted ? ' · AI改写材料' : ''}
    </span>
  );
}
export default function SourceView({ passage }: { passage: Passage }) {
  const { state } = useStudy(),
    material = state.materials.find((m) => m.id === passage.materialId);
  return (
    <details className="original-material">
      <summary>查看原资料与来源{material ? '（可能含答案）' : ''}</summary>
      <div className="source-meta">
        <ContentBadge passage={passage} />
        <p>{passage.source}</p>
        {passage.provenance?.metadata && <p className="small-text muted">
          {(['year','paper','reference'] as const).map(key => {
            const basis = passage.provenance!.metadata![key];
            return <span key={key}>{({year:'年份',paper:'试卷名称',reference:'原始出处'})[key]}：{basis === 'ai' ? 'AI识别，待核实' : basis === 'user' ? '自行填写' : '待核实'}；</span>;
          })}
          {passage.provenance.metadata.evidence && <span>识别依据：{passage.provenance.metadata.evidence}</span>}
        </p>}
        <p>{passage.provenance?.paper}</p>
        <p>{passage.provenance?.reference}</p>
      </div>
      {material && (
        <>
          <strong>{material.name}</strong>
          {material.text && <pre>{material.text}</pre>}
          <div className="original-pages">
            {material.images.map((i, n) => (
              <figure key={n}>
                <img loading="lazy" src={i.url} alt={i.name} />
                <figcaption>{i.name}</figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
