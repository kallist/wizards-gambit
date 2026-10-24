import { lazy, Suspense, useEffect, useRef } from "react";
import Board2D, { type BoardProps } from "../renderers/Board2D";
import { DialogueText } from "../ui/DialogueText";
import { Icon } from "../ui/Icon";
import {
  MirrorCompanion,
  type Props as MirrorCompanionProps,
} from "../ui/MirrorCompanion";
import { PixelTeaScene } from "./PixelTeaScene";
import { JourneyKeepsake } from "./JourneyKeepsake";
import "./journey.css";

const Board3D = lazy(() => import("../renderers/Board3D"));

export type JourneyStage =
  "invite" | "playing" | "between" | "tea" | "route" | "home";

export interface JourneyAction {
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

export interface JourneyChoice extends JourneyAction {
  id: string;
  detail?: string;
  selected?: boolean;
}

export interface JourneyCard {
  id: string;
  name: string;
  description: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface JourneyCastSelection {
  description: string;
  confirmLabel?: string;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Display data and user intentions only; the controller owns game and save state. */
export interface JourneyScreenProps {
  stage: JourneyStage;
  heading: string;
  description?: string;
  stepLabel?: string;
  notice?: string;
  noticeImportant?: boolean;
  pending?: boolean;
  comfort?: boolean;
  board: BoardProps | null;
  mirror: MirrorCompanionProps;
  view: "2d" | "3d";
  cameraReset: number;
  onViewChange: (view: "2d" | "3d") => void;
  onCameraReset: () => void;
  onRendererFailure: () => void;
  onResign?: () => void;
  choices?: readonly JourneyChoice[];
  primary?: JourneyAction;
  secondary?: JourneyAction;
  cards?: readonly JourneyCard[];
  castSelection?: JourneyCastSelection | null;
  hint?: string;
  journal?: string;
  memorySource?: string;
  keepsakeRibbon?: boolean;
  teaState?: 0 | 1 | 2;
  teaCaption?: string;
  teaImage?: string;
  onBack: () => void;
}

export function JourneyScreen({
  stage,
  heading,
  description,
  stepLabel,
  notice,
  noticeImportant = false,
  pending = false,
  comfort,
  board,
  mirror,
  view,
  cameraReset,
  onViewChange,
  onCameraReset,
  onRendererFailure,
  onResign,
  choices = [],
  primary,
  secondary,
  cards = [],
  castSelection,
  hint,
  journal,
  memorySource,
  keepsakeRibbon = false,
  teaState = 0,
  teaCaption = "茶已放在桌上，等你们慢慢商量。",
  teaImage,
  onBack,
}: JourneyScreenProps) {
  const title = useRef<HTMLHeadingElement>(null);
  const tools = useRef<HTMLDetailsElement>(null);
  const reduced = comfort ?? board?.comfort ?? false;
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    title.current
      ?.closest("main")
      ?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [stage]);

  useEffect(() => {
    const heading = title.current?.parentElement;
    const header = heading?.parentElement;
    const main = header?.parentElement;
    if (!heading || !header || !main) return;
    const alignAvatar = () =>
      main.style.setProperty(
        "--journey-avatar-top",
        `${heading.offsetTop + header.offsetTop}px`,
      );
    const observer = new ResizeObserver(alignAvatar);
    observer.observe(header);
    observer.observe(heading);
    alignAvatar();
    return () => observer.disconnect();
  }, []);

  const response = (
    <section className="journey-response" aria-label="桌边的回应">
      <p className="journey-response-moment">{mirror.moment}</p>
      <p>
        <b>马尔福</b>
        <DialogueText>{mirror.conversation.malfoy}</DialogueText>
      </p>
      <p>
        <b>哈利</b>
        <DialogueText>{mirror.conversation.harry}</DialogueText>
      </p>
    </section>
  );
  const boardProps = board
    ? { ...board, comfort: reduced, disabled: board.disabled || pending }
    : null;

  return (
    <main
      className={`journey-screen${reduced ? " journey-comfort" : ""}`}
      data-stage={stage}
      data-testid="journey-screen"
      aria-busy={pending}
      aria-labelledby="journey-heading"
    >
      <header className="journey-header">
        <button className="journey-back" onClick={onBack} type="button">
          <Icon name="left" size={18} />
          <span>返回小屋</span>
        </button>
        <div className="journey-heading">
          {stepLabel && <p className="journey-step">{stepLabel}</p>}
          <h1 id="journey-heading" ref={title} tabIndex={-1}>
            {heading}
          </h1>
        </div>
        {stage === "playing" && (
          <details
            className="journey-tools"
            ref={tools}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              tools.current?.removeAttribute("open");
              tools.current?.querySelector("summary")?.focus();
            }}
          >
            <summary>
              <Icon name="settings" size={17} />
              棋桌工具
            </summary>
            <div className="journey-tool-panel">
              {onResign && (
                <button
                  type="button"
                  onClick={onResign}
                  disabled={!board || board.disabled}
                >
                  这盘认输
                </button>
              )}
              <div className="journey-view-switch" aria-label="棋盘视图">
                <button
                  type="button"
                  aria-pressed={view === "2d"}
                  onClick={() => onViewChange("2d")}
                >
                  <Icon name="grid" size={17} />
                  2D
                </button>
                <button
                  type="button"
                  aria-pressed={view === "3d"}
                  onClick={() => onViewChange("3d")}
                >
                  <Icon name="box" size={17} />
                  3D
                </button>
              </div>
              {view === "3d" && (
                <button type="button" onClick={onCameraReset}>
                  <Icon name="redo" size={16} />
                  复位镜头
                </button>
              )}
            </div>
          </details>
        )}
      </header>

      <div className="journey-table">
        <section className="journey-workspace" aria-label="今晚的约定与行动">
          {description && <p className="journey-description">{description}</p>}
          <p
            className={`journey-notice${noticeImportant ? " is-important" : ""}`}
            role="status"
            aria-atomic="true"
          >
            {notice}
          </p>

          {stage === "playing" && (
            <div className={`journey-board-frame journey-board-${view}`}>
              {boardProps ? (
                view === "2d" ? (
                  <Board2D {...boardProps} />
                ) : (
                  <Suspense
                    fallback={
                      <p className="journey-board-loading" role="status">
                        棋盘正在就位…
                      </p>
                    }
                  >
                    <Board3D
                      {...boardProps}
                      cameraReset={cameraReset}
                      onFailure={onRendererFailure}
                    />
                  </Suspense>
                )
              ) : (
                <p className="journey-board-loading" role="status">
                  棋盘正在就位…
                </p>
              )}
            </div>
          )}

          {(stage === "tea" || (stage === "route" && teaState !== 0)) && (
            <PixelTeaScene
              state={teaState}
              caption={teaCaption}
              image={teaImage}
              comfort={reduced}
            />
          )}

          {stage !== "playing" && response}

          {choices.length > 0 && (
            <div className="journey-choices" aria-label="今晚的选择">
              {choices.map((choice) => (
                <button
                  key={choice.id}
                  className="journey-choice"
                  type="button"
                  aria-pressed={choice.selected}
                  disabled={pending || choice.disabled}
                  onClick={choice.onSelect}
                >
                  <span className="journey-choice-label">
                    {choice.label}
                    {choice.selected && <Icon name="check" size={18} />}
                  </span>
                  {choice.detail && <small>{choice.detail}</small>}
                </button>
              ))}
            </div>
          )}

          {!castSelection && cards.length > 0 && (
            <section className="journey-cards" aria-label="手边的魔法">
              {cards.map((card) => (
                <button
                  key={card.id}
                  className="journey-card"
                  type="button"
                  aria-pressed={card.selected}
                  disabled={pending || card.disabled}
                  onClick={card.onSelect}
                >
                  <b>{card.name}</b>
                  <span>{card.description}</span>
                </button>
              ))}
            </section>
          )}

          {castSelection && (
            <section className="journey-cast" aria-label="确认这次施法">
              <p>{castSelection.description}</p>
              <div className="journey-actions">
                <button
                  className="journey-button journey-button-primary"
                  type="button"
                  onClick={castSelection.onConfirm}
                  disabled={pending || castSelection.disabled}
                >
                  {castSelection.confirmLabel ?? "确认施法"}
                </button>
                <button
                  className="journey-button"
                  type="button"
                  onClick={castSelection.onCancel}
                  disabled={pending}
                >
                  取消施法
                </button>
              </div>
            </section>
          )}

          {hint && (
            <section className="journey-hint" aria-label="一起商量">
              <Icon name="help" size={17} />
              <p>{hint}</p>
            </section>
          )}

          {(primary || secondary) && (
            <div className="journey-actions">
              {primary && (
                <button
                  className="journey-button journey-button-primary"
                  type="button"
                  onClick={primary.onSelect}
                  disabled={pending || primary.disabled}
                >
                  {primary.label}
                  <Icon name="right" size={18} />
                </button>
              )}
              {secondary && (
                <button
                  className="journey-button"
                  type="button"
                  onClick={secondary.onSelect}
                  disabled={pending || secondary.disabled}
                >
                  {secondary.label}
                </button>
              )}
            </div>
          )}

          {stage === "playing" && response}

          {memorySource && (
            <section className="journey-memory" aria-label="记忆的来处">
              <JourneyKeepsake ribbon={keepsakeRibbon} />
              <div>
                <h2>记忆的来处</h2>
                <p>{memorySource}</p>
              </div>
            </section>
          )}

          {journal && (
            <details className="journey-journal">
              <summary>
                <Icon name="book" size={17} />
                这一晚的手札
              </summary>
              <p>{journal}</p>
            </details>
          )}
        </section>

        <div className="journey-mirror">
          <MirrorCompanion {...mirror} />
        </div>
      </div>
    </main>
  );
}
