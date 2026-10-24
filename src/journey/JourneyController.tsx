import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyAction,
  inCheck,
  legalMoves,
  possibleCasts,
} from "../domain/engine";
import { pieceName, squareName } from "../domain/types";
import type { Action, GameState } from "../domain/types";
import { spellById } from "../domain/spells";
import type { Props as MirrorProps } from "../ui/MirrorCompanion";
import { Modal } from "../ui/Modal";
import { audio } from "../ui/audio";
import type { PlayerStorage } from "../platform/playerStorage";
import {
  createNodeGame,
  JOURNEY_NODES,
  PREPARATIONS,
  type PreparationId,
} from "./catalog";
import {
  initialJourneyProgress,
  type JourneyCommand,
  type JourneyProgress,
} from "./model";
import { commitJourney, JOURNEY_KEY, readJourney } from "./storage";
import { factText, memorySource, responseFor } from "./story";
import teaArt from "../assets/pixel-tea-v12.webp";
import {
  JourneyScreen,
  type JourneyAction,
  type JourneyChoice,
} from "./JourneyScreen";

type Intent = {
  [K in JourneyCommand["type"]]: Omit<
    Extract<JourneyCommand, { type: K }>,
    "commandId"
  >;
}[JourneyCommand["type"]];
interface Props {
  storage: PlayerStorage;
  companion: Pick<MirrorProps, "outfit" | "taps" | "companion" | "onWardrobe">;
  onTap: () => void;
  comfort: boolean;
  view: "2d" | "3d";
  onViewChange: (view: "2d" | "3d") => void;
  onBack: () => void;
}
const identity = () => crypto.randomUUID().replaceAll("-", "");

export function JourneyController(props: Props) {
  const [initial] = useState(() => {
    try {
      return { progress: readJourney(props.storage), error: "" };
    } catch {
      return {
        progress: initialJourneyProgress(),
        error: "棋旅原档未通过检查，已保留原件。请在设置中导出或恢复备份。",
      };
    }
  });
  const [progress, setProgress] = useState(initial.progress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [pending, setPending] = useState(false),
    busy = useRef(false);
  const [notice, setNotice] = useState(initial.error);
  const [saveError, setSaveError] = useState(!!initial.error);
  const [preparation, setPreparation] = useState<PreparationId>("thread");
  const [newEvening, setNewEvening] = useState(false);
  const [teaChoice, setTeaChoice] = useState<"offer" | "receive">("offer");
  const [keepsake, setKeepsake] = useState<"ribbon" | "cup-mark">("cup-mark");
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [spellTargets, setSpellTargets] = useState<number[]>([]);
  const [hint, setHint] = useState(""),
    hintLevel = useRef(0);
  const [journalOpen, setJournalOpen] = useState(false);
  const [cameraReset, setCameraReset] = useState(0);
  const [practice, setPractice] = useState<GameState | null>(null);
  const practiceRef = useRef(practice);
  practiceRef.current = practice;
  const [thinking, setThinking] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiRetry, setAiRetry] = useState(0);
  const [touches, setTouches] = useState(0);
  const lifetime = useRef(0),
    positionEpoch = useRef(0);
  const worker = useRef<Worker | null>(null);
  const request = useRef<{
    id: number;
    kind: "enemy" | "hint";
    version: number;
    epoch: number;
    runId?: string;
    nodeId?: number;
  } | null>(null);
  const requestNumber = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const run = progress.activeRun;
  const game = practice ?? run?.game ?? null;
  const position = useRef(game);
  position.current = game;
  const playing = practice ? !practice.result : run?.stage === "playing";
  const resetSelection = () => {
    setSelected(null);
    setSelectedCard(null);
    setSpellTargets([]);
  };

  const send = useCallback(
    async (intent: Intent): Promise<boolean> => {
      if (busy.current || initial.error) return false;
      busy.current = true;
      setPending(true);
      const epoch = lifetime.current;
      try {
        const result = await commitJourney(
          props.storage,
          progressRef.current.revision,
          { ...intent, commandId: identity() } as JourneyCommand,
          () => lifetime.current === epoch,
        );
        if (!result || lifetime.current !== epoch) return false;
        progressRef.current = result.progress;
        setProgress(result.progress);
        setSaveError(result.kind === "stale");
        setTouches(0);
        if (result.progress.activeRun?.stage !== "playing") {
          positionEpoch.current++;
          request.current = null;
          clearTimeout(timer.current);
          setThinking(false);
          setAiError("");
        }
        setNotice(
          result.kind === "stale"
            ? "另一窗口已更新这一晚，已读回当前进度，请重新选择。"
            : "这一晚已保存在当前存档中",
        );
        if (intent.type !== "help") resetSelection();
        if (intent.type === "play" && result.kind === "saved")
          audio.play(intent.action.type === "cast" ? "spell" : "move");
        return result.kind === "saved";
      } catch (error) {
        if (lifetime.current === epoch) {
          setSaveError(true);
          setNotice(
            error instanceof Error
              ? error.message
              : "棋旅未能保存，请重试；此前记录已保留",
          );
        }
        return false;
      } finally {
        if (lifetime.current === epoch) {
          busy.current = false;
          setPending(false);
        }
      }
    },
    [props.storage, initial.error],
  );

  const play = useCallback(
    async (action: Action, version: number) => {
      if (practiceRef.current) {
        if (practiceRef.current.version !== version) return;
        try {
          const next = applyAction(practiceRef.current, action);
          practiceRef.current = next;
          setPractice(next);
          resetSelection();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "练习操作无效");
        }
      } else await send({ type: "play", action, expectedGameVersion: version });
    },
    [send],
  );
  const playRef = useRef(play);
  playRef.current = play;

  useEffect(() => {
    lifetime.current++;
    const refresh = (e: StorageEvent) => {
      if (e.key !== props.storage.physicalKey(JOURNEY_KEY) && e.key !== null)
        return;
      try {
        const next = readJourney(props.storage);
        positionEpoch.current++;
        request.current = null;
        clearTimeout(timer.current);
        setThinking(false);
        setAiError("");
        setAiRetry((n) => n + 1);
        progressRef.current = next;
        setProgress(next);
        resetSelection();
      } catch {
        setSaveError(true);
        setNotice("另一窗口的棋旅记录未通过检查，当前画面已保留，请导出备份。");
      }
    };
    window.addEventListener("storage", refresh);
    return () => {
      lifetime.current++;
      window.removeEventListener("storage", refresh);
    };
  }, [props.storage]);

  useEffect(() => {
    let w: Worker;
    try {
      w = new Worker(new URL("../ai/worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      setAiError("当前入口未能启动棋影，请重试或先回小屋；进度保留。");
      return;
    }
    worker.current = w;
    w.onmessage = (e) => {
      const r = request.current;
      if (!r || r.id !== e.data.id) return;
      request.current = null;
      clearTimeout(timer.current);
      setThinking(false);
      if (
        r.epoch !== positionEpoch.current ||
        r.version !== position.current?.version ||
        (!practiceRef.current &&
          (progressRef.current.activeRun?.stage !== "playing" ||
            r.runId !== progressRef.current.activeRun.id ||
            r.nodeId !== progressRef.current.activeRun.nodeIndex))
      )
        return;
      if (e.data.error || !e.data.action) {
        setAiError("棋影暂时没能落子，请重新思考；这不算失败。");
        return;
      }
      const action = e.data.action as Action;
      if (r.kind === "enemy") void playRef.current(action, r.version);
      else if (action.type === "move")
        setHint(
          `可以试着从${squareName(action.move.from)}走到${squareName(action.move.to)}，再看国王的退路。它是一条候选建议，最后由你确认。`,
        );
      else if (action.type === "cast") {
        const card = position.current?.hands.white.find(
          (c) => c.id === action.cast.cardId,
        );
        setHint(
          `可以商量${card ? spellById[card.spell].name : "这次施法"}，目标${action.cast.targets.map(squareName).join(" → ")}。这会消耗整程的一张准备，仍由你决定。`,
        );
      }
    };
    w.onerror = () => {
      request.current = null;
      clearTimeout(timer.current);
      setThinking(false);
      setAiError("棋影思考中断，可重新思考；这不消耗重试。");
    };
    return () => {
      w.terminate();
      worker.current = null;
      request.current = null;
      clearTimeout(timer.current);
    };
  }, []);

  const think = (kind: "enemy" | "hint", source: GameState) => {
    if (!worker.current || request.current) return;
    const id = ++requestNumber.current;
    request.current = {
      id,
      kind,
      version: source.version,
      epoch: positionEpoch.current,
      runId: progressRef.current.activeRun?.id,
      nodeId: progressRef.current.activeRun?.nodeIndex,
    };
    setThinking(true);
    worker.current.postMessage({
      id,
      state: source,
      difficulty: "clever",
      deterministic: true,
    });
    timer.current = setTimeout(() => {
      if (request.current?.id === id) {
        request.current = null;
        setThinking(false);
        setAiError("这一步思考较久。可重新思考或回小屋，不会扣除重试。");
      }
    }, 15000);
  };
  useEffect(() => {
    if (playing && game?.turn === "black" && !pending && !aiError)
      think("enemy", game);
  }, [game?.version, playing, pending, aiError, aiRetry]);
  useEffect(() => {
    resetSelection();
    setHint("");
    hintLevel.current = 0;
    setTouches(0);
  }, [game?.version, run?.id]);

  const moves = useMemo(
    () =>
      game && selected !== null && !selectedCard
        ? legalMoves(game, selected)
        : [],
    [game, selected, selectedCard],
  );
  const casts = useMemo(
    () => (game && selectedCard ? possibleCasts(game, selectedCard) : []),
    [game, selectedCard],
  );
  const matches = casts.filter((c) =>
    spellTargets.every((at, i) => c.targets[i] === at),
  );
  const confirmed = matches.find(
    (c) => c.targets.length === spellTargets.length,
  );
  const canPlay =
    playing &&
    game?.turn === "white" &&
    !pending &&
    !thinking &&
    !initial.error;
  const onSquare = (at: number) => {
    if (!canPlay || !game) return;
    if (selectedCard) {
      const prefix = [...spellTargets, at];
      if (
        casts.some((c) => prefix.every((target, i) => c.targets[i] === target))
      )
        setSpellTargets(prefix);
      else if (casts.some((c) => c.targets[0] === at)) setSpellTargets([at]);
      else setNotice("这里不是这张魔法的合法目标；可以取消后重新选。");
      return;
    }
    const move = moves.find((m) => m.to === at);
    if (move) void play({ type: "move", move }, game.version);
    else if (game.board[at]?.color === "white") {
      setSelected(at);
      setHint(
        `${pieceName[game.board[at]!.kind]}：${game.board[at]!.kind === "n" ? "走日字，可以跳过棋子" : game.board[at]!.kind === "b" ? "沿斜线走，不能穿过棋子" : game.board[at]!.kind === "q" ? "沿直线或斜线走，不能穿过棋子" : "每次走相邻一格，不能进入被攻击的格子"}。亮点是当前合法落点。`,
      );
    } else setSelected(null);
  };
  const help = async () => {
    if (!canPlay || !game) return;
    const level = ["threat", "reason", "demo"][
      Math.min(hintLevel.current++, 2)
    ] as "threat" | "reason" | "demo";
    if (!practice && !(await send({ type: "help", level }))) return;
    if (level === "threat")
      setHint(
        inCheck(game, "white")
          ? "白王正被将军。先看能否移王、吃掉威胁或挡住攻击线；选中棋子后只会亮出安全的合法格。"
          : "将死要让黑王正在被将军，而且没有合法办法化解。先点一枚白棋，看它能照顾哪些退路；魔法也可以先不使用。",
      );
    else if (level === "reason")
      setHint(
        game.history.length === 0 && run
          ? JOURNEY_NODES[run.nodeIndex].premise +
              " 也可以不用魔法完成，试着保留一张给下一局。"
          : "先看黑王相邻的格子由谁控制。请分开判断：这一步有将军吗？国王还可以去哪格？点一次棋子就能查看合法落点。",
      );
    else think("hint", game);
  };

  const changePractice = (next: GameState | null) => {
    positionEpoch.current++;
    request.current = null;
    clearTimeout(timer.current);
    practiceRef.current = next;
    setPractice(next);
    setThinking(false);
    setAiError("");
    resetSelection();
    setHint("");
  };
  const start = async () => {
    setNewEvening(false);
    setAiError("");
    positionEpoch.current++;
    const values = crypto.getRandomValues(new Uint32Array(1));
    if (
      await send({
        type: "start",
        runId: identity(),
        seed: values[0] || 1,
        preparation,
      })
    )
      await send({ type: "acceptInvitation" });
  };
  const drafting = !run || newEvening;
  const stage = practice
    ? practice.result
      ? "between"
      : "playing"
    : drafting
      ? "invite"
      : run.stage === "retry"
        ? "between"
        : run.stage;
  const response = responseFor(drafting ? null : run, progress.lastMemory);
  if (touches % 2) {
    response.expression = response.expression === 2 ? 7 : 2;
    response.malfoy = "又碰到我的袖子了，波特。棋盘在那边，我可没走。";
    response.harry = "知道。只是想确认你还坐在这里。";
  }
  const teaFact = run?.facts.find((f) => f.type === "tea");
  const savedHome = run?.facts.at(-1)?.type === "home";
  const primary: JourneyAction = { label: "", onSelect: () => {} };
  const choices: JourneyChoice[] = [];
  let secondary: JourneyAction | undefined;
  let heading = "把今晚留给我们";
  let description = "三段短棋，一杯热茶。可以随时回小屋，下一次接着这一晚。";
  if (drafting) {
    for (const id of ["thread", "still"] as const)
      choices.push({
        id,
        label: PREPARATIONS[id].title,
        detail: PREPARATIONS[id].description,
        selected: preparation === id,
        onSelect: () => setPreparation(id),
      });
    primary.label = "和你一起出发";
    primary.onSelect = () => {
      void start();
    };
  } else if (practice) {
    heading = practice.result ? "这盘练习收好了" : "一起练这一盘";
    description =
      "无奖励练习 · 不推进棋旅，不消耗重试；刷新后回到已保存的正式进度。";
    primary.label = practice.result
      ? "回到这一晚"
      : aiError
        ? "重新思考"
        : "一起看这一步";
    primary.onSelect = practice.result
      ? () => changePractice(null)
      : aiError
        ? () => {
            setAiError("");
            setAiRetry((n) => n + 1);
          }
        : () => {
            void help();
          };
    secondary = { label: "结束练习", onSelect: () => changePractice(null) };
  } else if (run.stage === "invite") {
    primary.label = "把棋摆好";
    primary.onSelect = () => {
      void send({ type: "acceptInvitation" });
    };
  } else if (run.stage === "playing") {
    heading = JOURNEY_NODES[run.nodeIndex].title;
    description = `将死黑王 · 剩${Math.max(0, 3 - run.whiteMoves)}次己方走棋 · ${run.retriesUsed ? "重试已用" : "全程可重试1次"} · 不补牌`;
    primary.label = aiError
      ? "重新思考"
      : thinking
        ? "一起看着棋盘…"
        : "一起看这一步";
    primary.disabled = !aiError && !canPlay;
    primary.onSelect = aiError
      ? () => {
          setAiError("");
          setAiRetry((n) => n + 1);
        }
      : () => {
          void help();
        };
    secondary = {
      label: "今晚先回家",
      onSelect: () => {
        void send({ type: "abandon" });
      },
    };
  } else if (run.stage === "retry") {
    heading = "这一手，我们再商量";
    const failed = [...run.facts].reverse().find((f) => f.type === "node");
    description = `${failed ? factText(failed) : "这一局没走通。"} 这是本程唯一一次重试，会恢复本节点入场时的手牌。`;
    primary.label = "重试本节点";
    primary.onSelect = () => {
      setAiError("");
      void send({ type: "retry" });
    };
    secondary = {
      label: "今晚先回家",
      onSelect: () => {
        void send({ type: "abandon" });
      },
    };
  } else if (run.stage === "tea") {
    heading = "棋收一收，茶还热着";
    description =
      "第一局已将死。先把这杯茶递到对方手边，再选接下来两局的顺序。";
    choices.push(
      {
        id: "offer",
        label: "这次我来递给你",
        selected: teaChoice === "offer",
        onSelect: () => setTeaChoice("offer"),
      },
      {
        id: "receive",
        label: "接过她留给我的茶",
        selected: teaChoice === "receive",
        onSelect: () => setTeaChoice("receive"),
      },
    );
    primary.label = teaChoice === "offer" ? "把茶递给她" : "接过她的茶";
    primary.onSelect = () => {
      void send({ type: "tea", choice: teaChoice });
    };
  } else if (run.stage === "route") {
    heading = "茶暖着，下一页你来挑";
    description = `剩下${run.remainingHand.length}张准备，两局之间不会补牌。先去哪里都能不用魔法完成，留给后面的选择会不同。`;
    choices.push(
      ...([1, 2] as const).map((id) => ({
        id: String(id),
        label: "先去 · " + JOURNEY_NODES[id].title,
        detail: JOURNEY_NODES[id].premise,
        onSelect: () => {
          void send({ type: "route", firstNode: id });
        },
      })),
    );
    primary.label = "慢慢喝一口再出发";
    primary.disabled = true;
  } else if (run.stage === "between") {
    heading = "这一页，收进棋谱里";
    description = "已确认将死。手边没用掉的魔法，会原样带到最后一局。";
    primary.label = "继续下一段";
    primary.onSelect = () => {
      void send({ type: "advance" });
    };
  } else {
    heading =
      run.outcome === "complete" ? "三段棋，和同一个你" : "今晚先回家，也很好";
    description = savedHome
      ? "星纹杯垫已收好。第一次留下的图案与来由都会保留，也记住了最近这一晚。"
      : "战术旅程到这里结束，相处还没有。选一处小记号，把确实发生的这一晚留下。";
    if (!savedHome)
      choices.push(
        {
          id: "cup-mark",
          label: "留下一圈温热的杯痕",
          selected: keepsake === "cup-mark",
          onSelect: () => setKeepsake("cup-mark"),
        },
        {
          id: "ribbon",
          label: "给杯垫系一条绿缎带",
          selected: keepsake === "ribbon",
          onSelect: () => setKeepsake("ribbon"),
        },
      );
    primary.label = savedHome ? "再约一晚" : "把这一晚留下";
    primary.onSelect = savedHome
      ? () => {
          setNewEvening(true);
          setTouches(0);
        }
      : () => {
          void send({ type: "finishHome", keepsake });
        };
    secondary = {
      label: "无奖励练习这一盘",
      onSelect: () =>
        changePractice(
          createNodeGame(run.nodeIndex, run.nodeEntryHand, run.seed),
        ),
    };
  }
  primary.disabled = primary.disabled || !!initial.error;
  const journal =
    run?.facts.map(factText).join("\n") ??
    "先选一份准备，今晚的棋谱就从这里开始。";
  const mirror: MirrorProps = {
    ...props.companion,
    conversation: response,
    expression: response.expression,
    moment: thinking
      ? "棋影正在思考"
      : practice
        ? "一起练习，不改变这一晚"
        : heading,
    compactMoment: thinking
      ? "思考中"
      : stage === "playing"
        ? game?.turn === "white"
          ? "轮到你"
          : "等棋影"
        : "她在桌边",
    onTap: () => {
      props.onTap();
      setTouches((n) => n + 1);
    },
    onChat: () => {
      setTouches((n) => n + 1);
    },
    onHistory: () => setJournalOpen(true),
    onHint: () => {
      void help();
    },
    hintDisabled: !canPlay,
    reward: null,
    pendingReward: false,
    onRetry: () => {},
    onTryReward: () => {},
  };
  const board =
    game && playing
      ? {
          state: game,
          selected,
          targets: moves.map((m) => m.to),
          castTargets: [
            ...spellTargets,
            ...matches
              .map((c) => c.targets[spellTargets.length])
              .filter((at) => at !== undefined),
          ],
          flipped: false,
          comfort: props.comfort,
          onSquare,
          disabled: !canPlay,
          lastEvent: game.history.at(-1) ?? null,
          eventId: game.version,
        }
      : null;
  return (
    <>
      <JourneyScreen
        stage={stage}
        heading={heading}
        description={description}
        stepLabel={
          practice
            ? "独立练习"
            : drafting
              ? "星图棋旅 · 第一夜"
              : `第一夜 · 已走完${run.completedNodeIds.length}/3段`
        }
        notice={
          aiError ||
          notice ||
          (props.storage.scope === "temporary"
            ? "隔离临时游玩：刷新或关闭前请导出备份"
            : "随时可停下；保存失败会明确显示，不消耗重试")
        }
        noticeImportant={
          saveError || !!aiError || props.storage.scope === "temporary"
        }
        pending={pending}
        comfort={props.comfort}
        board={board}
        mirror={mirror}
        view={props.view}
        cameraReset={cameraReset}
        onViewChange={props.onViewChange}
        onCameraReset={() => setCameraReset((n) => n + 1)}
        onRendererFailure={() => {
          props.onViewChange("2d");
          setNotice("3D暂不可用，已回到2D棋盘；局面保留。");
        }}
        onResign={() => {
          if (canPlay && game) void play({ type: "resign" }, game.version);
        }}
        choices={choices}
        primary={primary}
        secondary={secondary}
        cards={
          playing && game
            ? game.hands.white.map((card) => ({
                id: card.id,
                name: spellById[card.spell].name,
                description: spellById[card.spell].description,
                selected: card.id === selectedCard,
                disabled: !canPlay || game.phase !== "play",
                onSelect: () => {
                  setSelected(null);
                  setSelectedCard(card.id);
                  setSpellTargets([]);
                },
              }))
            : []
        }
        castSelection={
          selectedCard &&
          game?.hands.white.some((card) => card.id === selectedCard)
            ? {
                description: `${spellById[game!.hands.white.find((card) => card.id === selectedCard)!.spell].description} ${
                  confirmed
                    ? "目标已选好；确认才会消耗这一张整程准备。"
                    : "先点魔法目标；飞来咒先选己方主教，再选空落点。"
                }`,
                disabled: !confirmed || !canPlay,
                onConfirm: () => {
                  if (confirmed && game)
                    void play({ type: "cast", cast: confirmed }, game.version);
                },
                onCancel: resetSelection,
              }
            : null
        }
        hint={hint}
        journal={journal}
        memorySource={
          progress.lastMemory ? memorySource(progress.lastMemory) : undefined
        }
        keepsakeRibbon={progress.lastMemory?.keepsake === "ribbon"}
        teaState={
          teaFact?.type === "tea" ? (teaFact.choice === "offer" ? 1 : 2) : 0
        }
        teaImage={teaArt}
        teaCaption={
          teaFact?.type === "tea"
            ? factText(teaFact)
            : "两杯茶都已斟好，等两人伸手。"
        }
        onBack={props.onBack}
      />
      {journalOpen && (
        <Modal title="这一晚的棋谱" onClose={() => setJournalOpen(false)}>
          <p style={{ whiteSpace: "pre-line" }}>{journal}</p>
        </Modal>
      )}
    </>
  );
}
