import { characterInteraction } from "../story/interaction";
import { Icon } from "./Icon";
export function Character({
  taps,
  frame,
  onTap,
  large = false,
}: {
  taps: number;
  frame?: number;
  onTap: () => void;
  large?: boolean;
}) {
  const state = characterInteraction(taps),
    active = frame ?? state.frame;
  const names = [
    "若无其事",
    "耳尖微红",
    "嘴硬中",
    "藏不住的害羞",
    "只对你温柔",
  ];
  return (
    <div
      className={`character ${large ? "hero-character" : ""} blush-${state.stage}`}
    >
      <div className="portrait-halo" />
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <button
        type="button"
        className="portrait-button"
        aria-label={`与马尔福互动，${names[state.stage]}`}
        onClick={onTap}
        data-testid="malfoy-portrait"
        data-stage={state.stage}
      >
        <span
          className="portrait-art"
          role="img"
          aria-label="成年女性马尔福立绘"
          style={{
            backgroundPosition: `${((active % 4) / 3) * 100}% ${active < 4 ? 0 : 100}%`,
          }}
        />
        <span className="touch-hint">
          <Icon name="hand" size={15} />
          {taps === 0 ? "轻触她的立绘" : names[state.stage]}
          <span className="tiny-heart">
            <Icon name="heart" size={13} />
          </span>
        </span>
        <span className="portrait-spark spark-one" />
        <span className="portrait-spark spark-two" />
      </button>
      <div className="character-name">
        <span className="hairline" />
        <div>
          <strong>德拉科 · 马尔福</strong>
          <small>DRACO MALFOY</small>
        </div>
        <span className="hairline" />
      </div>
    </div>
  );
}
