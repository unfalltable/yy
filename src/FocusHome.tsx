import { ArrowRight } from 'lucide-react';
import { useStudy } from './context';
import { examNames } from './data';
export default function FocusHome() {
  const { state, begin, bank, current, start } = useStudy();
  const ongoing = [...bank].sort((a,b) => Number(b.id === current) - Number(a.id === current)).find(
    (p) =>
      (p.kind === 'reading' || p.kind === 'listening') &&
      state.drafts[p.id] &&
      !state.drafts[p.id].finished,
  );
  return (
    <section className="focus-home">
      <div className="focus-intro">
        <p className="home-kicker">一篇材料，一点进步</p>
        <h1>
          今天，
          <br />
          从一篇开始。
        </h1>
        <p className="home-description">直接选题开练，考试、年份和难度都能随时筛选。</p>
        <button className="primary start-learning" onClick={begin}>
          开始学习
          <ArrowRight size={20} />
        </button>
        {ongoing ? (
          <button className="resume-study" onClick={() => start(ongoing)}>
            继续 {examNames[ongoing.exam]}：{ongoing.title}
          </button>
        ) : (
          <p className="home-target">考研英语一 / 英语二优先，也支持雅思与托福</p>
        )}
      </div>

    </section>
  );
}
