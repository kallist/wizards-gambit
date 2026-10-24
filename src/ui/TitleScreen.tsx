import { useEffect, useRef, useState } from "react";
import cottage from "../assets/pixel-cottage-v6.webp";
import { EnchantedMirror } from "./EnchantedMirror";
import {
  expressionFor,
  type OutfitId,
  type Expression,
} from "../story/companion";
import { characterInteraction } from "../story/interaction";
import { Icon } from "./Icon";
import { DialogueText } from "./DialogueText";
import { JourneyKeepsake } from "../journey/JourneyKeepsake";

interface Props {
  onJourney?: () => void;
  journeyResume?: boolean;
  journeyKeepsake?: { ribbon: boolean; source: string };
  comfort: boolean;
  entered: boolean;
  onEnter: () => void;
  onCover: () => void;
  taps: number;
  outfit: OutfitId;
  frame?: number;
  expression?: Expression;
  onTap: () => void;
  onChat: () => void;
  onStory: () => void;
  onContinue: () => void;
  onAI: () => void;
  onLocal: () => void;
  onOnline: () => void;
  onGallery: () => void;
  onRank: () => void;
  onBook: () => void;
  onSpells: () => void;
  onWardrobe: () => void;
  canContinue: boolean;
  conversation: { malfoy: string; harry: string };
}

export function TitleScreen(props: Props) {
  const [talk, setTalk] = useState(false);
  const [table, setTable] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const woman = useRef<HTMLButtonElement>(null);
  const desk = useRef<HTMLButtonElement>(null);
  const house = useRef<HTMLDivElement>(null);
  const state = characterInteraction(props.taps);
  useEffect(() => {
    if (table || talk)
      panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [table, talk]);
  const close = () => {
    const wasTable = table;
    setTalk(false);
    setTable(false);
    (wasTable ? desk : woman).current?.focus();
  };
  const converse = () => {
    props.onEnter();
    setTalk(true);
    setTable(false);
    props.onTap();
  };
  return (
    <main
      className={`cottage-hub ${props.entered ? "is-entered" : "is-cover"} ${talk ? "is-talking" : ""}`}
      data-testid="cottage-hub"
      data-state={talk ? "chat" : props.entered ? "room" : "cover"}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      {props.journeyKeepsake && props.onJourney && !talk && !table && (
        <button
          className="cottage-keepsake"
          onClick={props.onJourney}
          aria-label="杯垫上的这一晚"
          title={props.journeyKeepsake.source}
        >
          <JourneyKeepsake ribbon={props.journeyKeepsake.ribbon} />
          <span>
            杯垫上的这一晚<small>{props.journeyKeepsake.source}</small>
          </span>
        </button>
      )}
      {!props.entered && (
        <section className="cottage-title">
          <h1 aria-label="巫师棋：与马尔福的甜蜜生活">
            <span>
              <i>巫</i>
              <i>师</i>
              <i>棋</i>
            </span>
            <small>与马尔福的甜蜜生活</small>
          </h1>
          <div className="cover-actions">
            {props.onJourney && (
              <button
                className="pixel-button primary"
                onClick={props.onJourney}
              >
                {props.journeyResume ? "继续这一晚" : "今晚棋旅"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            )}
            <button
              className={`pixel-button ${props.onJourney ? "" : "primary"}`}
              onClick={props.onEnter}
            >
              进入游戏 <span aria-hidden="true">→</span>
            </button>
            {props.canContinue && (
              <button className="cover-continue" onClick={props.onContinue}>
                继续游戏
              </button>
            )}
          </div>
        </section>
      )}
      {props.entered && (
        <div className="room-heading">
          <button
            className="text-button"
            onClick={() => {
              close();
              props.onCover();
            }}
          >
            ← 返回封面
          </button>
          <span>星夜小屋</span>
          {props.onJourney && (
            <button className="text-button" onClick={props.onJourney}>
              {props.journeyResume ? "继续这一晚" : "今晚棋旅"} →
            </button>
          )}
        </div>
      )}
      <div className="cottage-stage">
        <div className="cottage-model" ref={house}>
          <div className="cottage-bob">
            <img
              className="cottage-art"
              src={cottage}
              alt="星空中的剖面小屋，哈利与马尔福正在棋桌旁相对而坐"
              draggable={false}
            />
            <div className="cottage-life" aria-hidden="true">
              <i className="cottage-fire" />
              <i className="cottage-window" />
              <i className="cottage-smoke" />
              <i className="cottage-smoke smoke-second" />
              <i className="cottage-smoke smoke-third" />
            </div>
          </div>
        </div>
        <button
          className="cottage-touch"
          aria-label={props.entered ? "轻触小屋" : "走近小屋"}
          onClick={() => {
            if (!props.entered) props.onEnter();
            else if (!props.comfort) {
              house.current
                ?.getAnimations()
                .forEach((animation) => animation.cancel());
              house.current?.animate(
                [
                  { transform: "translateY(0) rotate(0deg)" },
                  { transform: "translateY(-10px) rotate(-1deg)", offset: 0.4 },
                  { transform: "translateY(0) rotate(0deg)" },
                ],
                { duration: 650, easing: "cubic-bezier(.2,.7,.3,1)" },
              );
            }
          }}
        />
        <button
          ref={woman}
          className="room-hotspot malfoy-hotspot"
          aria-label="和马尔福聊聊"
          data-testid={talk ? "room-malfoy" : "malfoy-portrait"}
          data-stage={state.stage}
          onClick={converse}
        >
          <span>
            聊聊 <i aria-hidden="true">◇</i>
          </span>
        </button>
        <button
          ref={desk}
          className="room-hotspot chess-hotspot"
          aria-label="打开棋桌"
          aria-expanded={table}
          onClick={() => {
            props.onEnter();
            setTalk(false);
            setTable(!table);
          }}
        >
          <span>
            约棋 <i aria-hidden="true">◇</i>
          </span>
        </button>
      </div>
      {table && (
        <section className="hub-mode-menu" ref={panel} aria-label="选择棋局">
          <div className="hub-panel-heading">
            <h2>今晚，下一局？</h2>
            <button
              className="icon-button"
              aria-label="收起棋局选择"
              onClick={close}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          {props.canContinue && (
            <button className="pixel-button primary" onClick={props.onContinue}>
              继续游戏 <span aria-hidden="true">→</span>
            </button>
          )}
          <button onClick={props.onStory} aria-label="赴一场约棋">
            情书里的棋局 <span>六封信，慢慢读</span>
          </button>
          <button onClick={props.onAI}>
            人机对弈 <span>陪练或较量</span>
          </button>
          <button onClick={props.onLocal}>
            同机双人 <span>轮流执子，慢慢下</span>
          </button>
          <button onClick={props.onOnline}>
            好友联网 <span>给远方的人留个座位</span>
          </button>
        </section>
      )}
      {talk && (
        <section
          className="hub-conversation"
          ref={panel}
          aria-label="与马尔福交谈"
        >
          <button
            className="icon-button hub-close"
            aria-label="收起聊天"
            onClick={close}
          >
            <Icon name="close" />
          </button>
          <button
            className="hub-character"
            data-testid="malfoy-portrait"
            data-stage={state.stage}
            aria-label={`与马尔福互动，羞涩阶段${state.stage}`}
            onClick={props.onTap}
          >
            <EnchantedMirror
              outfit={props.outfit}
              expression={
                props.expression ?? expressionFor(props.taps, props.frame)
              }
            />
          </button>
          <div className="hub-dialogue" aria-live="polite">
            <h2>德拉科 · 马尔福</h2>
            <p>
              <DialogueText>{props.conversation.malfoy}</DialogueText>
            </p>
            <small>
              <b>哈利</b>
              <DialogueText>{props.conversation.harry}</DialogueText>
            </small>
            <div className="conversation-choices">
              <button onClick={props.onChat}>聊聊今天</button>
              <button onClick={props.onTap}>靠近一点</button>
              <button onClick={props.onWardrobe}>看看衣橱</button>
            </div>
          </div>
        </section>
      )}
      <nav className="cottage-shortcuts" aria-label="小屋收藏">
        <button onClick={props.onWardrobe} aria-label="衣装收藏">
          <Icon name="crown" size={18} />
          衣橱
        </button>
        <button onClick={props.onBook} aria-label="故事手札">
          <Icon name="feather" size={18} />
          冬日手札
        </button>
        <button onClick={props.onGallery}>
          <Icon name="heart" size={18} />
          回忆画廊
        </button>
        <button onClick={props.onSpells} aria-label="魔法图鉴">
          <Icon name="wand" size={18} />
          魔法图鉴
        </button>
      </nav>
    </main>
  );
}
