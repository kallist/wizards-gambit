import { useEffect, useState } from "react";
import { characterInteraction } from "../story/interaction";
import {
  expressionFor,
  innerThought,
  outfitById,
  EXPRESSION_NAMES,
  type CompanionProgress,
  type OutfitId,
  type Expression,
} from "../story/companion";
import { OutfitSprite } from "./OutfitSprite";
import { EnchantedMirror } from "./EnchantedMirror";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { DialogueText } from "./DialogueText";

export interface Props {
  outfit: OutfitId;
  taps: number;
  frame?: number;
  expression?: Expression;
  companion: CompanionProgress;
  conversation: { malfoy: string; harry: string };
  moment: string;
  compactMoment: string;
  onTap: () => void;
  onChat: () => void;
  onWardrobe: () => void;
  onHistory: () => void;
  onHint?: () => void;
  hintDisabled?: boolean;
  reward: OutfitId | null;
  onTryReward: () => void;
  pendingReward: boolean;
  onRetry: () => void;
}
export function MirrorCompanion(props: Props) {
  const [compact, setCompact] = useState(
    () =>
      window.matchMedia("(max-width: 720px) and (orientation: portrait)")
        .matches,
  );
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(
      "(max-width: 720px) and (orientation: portrait)",
    );
    const change = () => setCompact(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const emotion = props.expression ?? expressionFor(props.taps, props.frame),
    stage = characterInteraction(props.taps).stage;
  const contents = (
    <>
      <div className="mirror-heading">
        <b>德拉科 · 马尔福</b>
        <span>{outfitById(props.outfit).name}</span>
      </div>
      <div className="mirror-portrait">
        <button
          className="mirror-character"
          data-testid="malfoy-portrait"
          data-stage={stage}
          aria-label={`与马尔福互动，羞涩阶段${stage}`}
          onClick={props.onTap}
        >
          <EnchantedMirror outfit={props.outfit} expression={emotion} />
        </button>
      </div>
      <div className="mirror-status">
        <label>
          <span>
            心动 <b>{props.companion.heart}</b>
          </span>
          <progress
            max={100}
            value={props.companion.heart}
            aria-label="马尔福心动值"
          />
        </label>
        <label>
          <span>
            羞涩 <b>{EXPRESSION_NAMES[emotion]}</b>
          </span>
          <progress max={4} value={stage} aria-label="马尔福羞涩度" />
        </label>
      </div>
      <div className="mirror-dialogue" aria-live="polite">
        <div
          className="companion-board-moment"
          data-testid="companion-board-moment"
        >
          <Icon name="crown" size={13} />
          <span>{props.moment}</span>
        </div>
        <span>德拉科 · 马尔福</span>
        <p key={props.conversation.malfoy} className="companion-response">
          <DialogueText>{props.conversation.malfoy}</DialogueText>
        </p>
        <small>
          <b>哈利</b>
          <DialogueText>{props.conversation.harry}</DialogueText>
        </small>
      </div>
      <details className="mirror-thought">
        <summary>
          <Icon name="heart" size={12} />
          她的心事
        </summary>
        <p>{innerThought(props.companion.heart, emotion, props.frame)}</p>
      </details>
      {props.reward && (
        <div className="wardrobe-reward" role="status">
          <Icon name="spark" size={17} />
          <span>新衣装 · {outfitById(props.reward).name}</span>
          <button onClick={props.onTryReward}>试穿</button>
        </div>
      )}
      {props.pendingReward && (
        <button className="reward-retry" onClick={props.onRetry}>
          衣装未保存 · 重试领取
        </button>
      )}
      <div className="mirror-actions">
        <button aria-label="和她聊聊" title="和她聊聊" onClick={props.onChat}>
          说说话
        </button>
        <button
          aria-label="衣装收藏"
          title="衣装收藏"
          onClick={() => {
            setExpanded(false);
            props.onWardrobe();
          }}
        >
          衣橱
        </button>
        {props.onHint && (
          <button
            aria-label="和她商量一步"
            title="和她商量一步"
            disabled={props.hintDisabled}
            onClick={props.onHint}
          >
            提示
          </button>
        )}
        <button
          aria-label="棋局手札"
          title="棋局手札"
          onClick={() => {
            setExpanded(false);
            props.onHistory();
          }}
        >
          手札
        </button>
      </div>
    </>
  );
  if (compact)
    return (
      <>
        <button
          className="mirror-mobile-tab"
          onClick={() => setExpanded(true)}
          aria-label="展开魔镜"
          aria-description={props.moment}
          aria-expanded={expanded}
        >
          <span className="mobile-companion-face">
            <OutfitSprite
              outfit={props.outfit}
              expression={emotion}
              align="top"
            />
          </span>
          <span>
            马尔福<small title={props.moment}>{props.compactMoment}</small>
          </span>
        </button>
        {expanded && (
          <Modal title="魔镜里的她" onClose={() => setExpanded(false)}>
            <div
              className="mirror-panel mobile-mirror"
              data-testid="mirror-companion"
            >
              {contents}
            </div>
          </Modal>
        )}
      </>
    );
  return (
    <aside
      className="mirror-panel"
      aria-label="马尔福的全身魔镜"
      data-testid="mirror-companion"
    >
      {contents}
    </aside>
  );
}
