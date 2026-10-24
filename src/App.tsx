import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { aiView, type Difficulty } from "./ai/search";
import {
  applyAction,
  createGame,
  inCheck,
  legalMoves,
  possibleCasts,
  validateSavedGame,
} from "./domain/engine";
import { SPELLS, spellById } from "./domain/spells";
import { other, pieceName, squareName } from "./domain/types";
import type {
  Action,
  Card,
  Color,
  GameState,
  Move,
  RecordEntry,
} from "./domain/types";
import Board2D from "./renderers/Board2D";
import { PieceIcon } from "./renderers/PieceIcon";
import {
  CHAPTERS,
  chapterComplete,
  chapterGame,
  trialGame,
  trialScore,
  type Dialogue,
  type Trigger,
} from "./story/chapters";
import { tapResponse } from "./story/interaction";
import {
  RoomClient,
  rulesForViewer,
  type ConnectionStatus,
  type RoomSnapshot,
} from "./platform/room";
import {
  fetchRanks,
  isToyHost,
  readProgress,
  mergeProgress,
  persistProgress,
  submitTrial,
  toyError,
  type Progress,
  type RankEntry,
} from "./platform/toy";
import { TitleScreen } from "./ui/TitleScreen";
import { Starfield } from "./ui/Starfield";
import { SpellArt } from "./ui/SpellArt";
import { SpellLibrary } from "./ui/SpellLibrary";
import { ART, CG, CG_NAMES } from "./ui/art";
import { MirrorCompanion } from "./ui/MirrorCompanion";
import { Wardrobe } from "./ui/Wardrobe";
import { OutfitStory } from "./ui/OutfitStory";
import {
  addHeart,
  claimOutfit,
  newMatchId,
  readCompanion,
  COMPANION_KEY,
} from "./platform/companion";
import {
  outfitById,
  ownsOutfit,
  validMatchId,
  expressionFor,
  type Expression,
  type OutfitId,
} from "./story/companion";
import { Icon } from "./ui/Icon";
import { Modal } from "./ui/Modal";
import { audio } from "./ui/audio";
import { SaveControls, usePlayerSave } from "./platform/SaveBoundary";
import { PLAYER_KEYS, type PlayerStorage } from "./platform/playerStorage";
import { JourneyController } from "./journey/JourneyController";
import { readJourney } from "./journey/storage";

const Board3D = lazy(() => import("./renderers/Board3D"));
type Mode = "story" | "ai" | "local" | "online" | "trial";
type Overlay =
  | "story"
  | "setup"
  | "settings"
  | "rules"
  | "spells"
  | "rank"
  | "online"
  | "scene"
  | "result"
  | "gallery"
  | "wardrobe"
  | "outfit-story"
  | "history"
  | null;
const modeNames: Record<Mode, string> = {
  story: "故事约棋",
  ai: "人机对弈",
  local: "同机双人",
  online: "好友棋室",
  trial: "魔法试炼",
};
const difficultyNames: Record<Difficulty, string> = {
  gentle: "温柔陪练",
  normal: "认真较量",
  clever: "旗鼓相当",
};
const SESSION_KEY = "wizards-gambit-session-v1",
  SETTINGS_KEY = "wizards-gambit-settings-v1";
interface SavedSession {
  matchId?: string;
  mode: Exclude<Mode, "online">;
  state: GameState;
  chapter: number;
  human: Color;
  difficulty: Difficulty;
}
function readSession(storage: PlayerStorage): SavedSession | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw || raw.length > 1200000) return null;
    const x = JSON.parse(raw);
    if (
      ["story", "ai", "local", "trial"].includes(x.mode) &&
      validateSavedGame(x.state) &&
      Number.isInteger(x.chapter) &&
      x.chapter >= 0 &&
      x.chapter < 6 &&
      ["white", "black"].includes(x.human) &&
      ["gentle", "normal", "clever"].includes(x.difficulty)
    )
      return x;
  } catch {
    /* Isolated, invalid saves are ignored. */
  }
  return null;
}
function readSettings(storage: PlayerStorage) {
  try {
    const value = JSON.parse(storage.getItem(SETTINGS_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}

export default function App() {
  const { storage } = usePlayerSave();
  const [restored] = useState(() => readSession(storage)),
    [initialSettings] = useState(() => readSettings(storage));
  const [screen, setScreen] = useState<"home" | "room" | "game" | "journey">(
      "home",
    ),
    [overlay, setOverlay] = useState<Overlay>(null);
  const [mode, setMode] = useState<Mode>(restored?.mode ?? "story"),
    [game, setGame] = useState<GameState | null>(restored?.state ?? null);
  const [human, setHuman] = useState<Color>(restored?.human ?? "white"),
    [difficulty, setDifficulty] = useState<Difficulty>(
      restored?.difficulty ?? "normal",
    );
  const [setupColor, setSetupColor] = useState<Color>(
      restored?.human ?? "white",
    ),
    [setupDifficulty, setSetupDifficulty] = useState<Difficulty>(
      restored?.difficulty ?? "normal",
    );
  const [chapter, setChapter] = useState(restored?.chapter ?? 0),
    [scene, setScene] = useState({ chapter: 0, ending: false, line: 0 });
  const [progress, setProgress] = useState(() => readProgress(storage)),
    progressRef = useRef(progress);
  progressRef.current = progress;
  const [companion, setCompanion] = useState(() =>
    readCompanion(progress.taps, storage),
  );
  const companionRef = useRef(companion);
  companionRef.current = companion;
  const [matchId, setMatchId] = useState(() =>
    validMatchId(restored?.matchId) ? restored.matchId : newMatchId(),
  );
  const [reward, setReward] = useState<OutfitId | null>(null);
  const [pendingReward, setPendingReward] = useState<string | null>(null);
  const rewardAttempts = useRef(new Set<string>());
  const [storyOutfit, setStoryOutfit] = useState<OutfitId>("college");
  const [view, setView] = useState<"3d" | "2d">(
    initialSettings.view === "3d" ? "3d" : "2d",
  );
  const [comfort, setComfort] = useState(
    initialSettings.comfort === true ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [sound, setSound] = useState(false),
    [flipped, setFlipped] = useState(false);
  const [cameraReset, setCameraReset] = useState(0),
    [outfit, setOutfit] = useState<OutfitId>(
      ownsOutfit(companion, outfitById(initialSettings.outfit).id)
        ? outfitById(initialSettings.outfit).id
        : "college",
    ),
    [galleryIndex, setGalleryIndex] = useState(0);
  const [musicVolume, setMusicVolume] = useState(
    typeof initialSettings.musicVolume === "number" &&
      initialSettings.musicVolume >= 0 &&
      initialSettings.musicVolume <= 1
      ? initialSettings.musicVolume
      : 0.35,
  );
  const [selected, setSelected] = useState<number | null>(null),
    [selectedCard, setSelectedCard] = useState<string | null>(null),
    [spellTargets, setSpellTargets] = useState<number[]>([]);
  const [promotion, setPromotion] = useState<Move[] | null>(null),
    [handover, setHandover] = useState(false),
    [discardVisible, setDiscardVisible] = useState(false);
  const [notice, setNotice] = useState(""),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [frame, setFrame] = useState<number | undefined>(),
    frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tapExpression, setTapExpression] = useState<Expression | undefined>();
  const tapExpressionRef = useRef<Expression | undefined>(undefined);
  const tapCursor = useRef(progress.taps);
  const dialogueCursor = useRef(0);
  const lastDialogue = useRef("");
  const clearTapReaction = useCallback(() => {
    tapExpressionRef.current = undefined;
    setTapExpression(undefined);
  }, []);
  const [conversation, setConversation] = useState({
    malfoy: "坐吧，波特。茶还热着，棋子也没跑。",
    harry: "看来我来得正好。",
  });
  const [sessionId, setSessionId] = useState(0),
    sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;
  const [aiThinking, setAiThinking] = useState(false),
    [hintThinking, setHintThinking] = useState(false),
    [aiRetry, setAiRetry] = useState(0);
  const worker = useRef<Worker | null>(null),
    request = useRef<{
      id: number;
      kind: "ai" | "hint";
      version: number;
      session: number;
    } | null>(null),
    requestId = useRef(0);
  const gameRef = useRef(game);
  gameRef.current = game;
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(false),
    resultSeen = useRef(false),
    usedDialogue = useRef(new Set<string>()),
    processedEvent = useRef("");
  const [lastEvent, setLastEvent] = useState<RecordEntry | null>(null),
    [eventId, setEventId] = useState(0);
  const [setupMode, setSetupMode] = useState<"ai" | "local">("ai"),
    [rules, setRules] = useState<"magic" | "classic">("magic");
  const [room, setRoom] = useState<RoomSnapshot | null>(null),
    roomRef = useRef(room);
  roomRef.current = room;
  const [connection, setConnection] = useState<ConnectionStatus>("idle"),
    [roomCode, setRoomCode] = useState(""),
    [pending, setPending] = useState(false),
    pendingRef = useRef(false);
  const roomClient = useRef<RoomClient | null>(null),
    [hasRoomSave, setHasRoomSave] = useState(false);
  const [ranks, setRanks] = useState<RankEntry[]>([]),
    [rankLoading, setRankLoading] = useState(false),
    [rankError, setRankError] = useState("");
  const [spellCategory, setSpellCategory] = useState("全部"),
    [spellQuery, setSpellQuery] = useState("");
  const [retryScore, setRetryScore] = useState<number | null>(null);
  const toast = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4200);
  }, []);

  const changeProgress = useCallback((next: Progress) => {
    progressRef.current = next;
    setProgress(next);
  }, []);
  useEffect(() => {
    let active = true;
    void persistProgress(progress, storage, () => active)
      .then((saved) => {
        if (!active || !saved) return;
        const merged = mergeProgress(progressRef.current, saved);
        if (JSON.stringify(merged) !== JSON.stringify(progressRef.current))
          changeProgress(merged);
      })
      .catch(() => {
        if (active) toast("浏览器无法保存进度，当前会话仍可继续");
      });
    return () => {
      active = false;
    };
  }, [progress, toast, storage, changeProgress]);
  useEffect(() => {
    try {
      storage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ view, comfort, outfit, musicVolume }),
      );
    } catch {
      toast("设置未能保存，请检查本机存储并导出备份");
    }
  }, [view, comfort, outfit, musicVolume]);
  useEffect(() => {
    audio.setEnabled(sound);
  }, [sound]);
  useEffect(() => {
    audio.setMusicVolume(musicVolume);
  }, [musicVolume]);
  useEffect(() => {
    const refresh = (e: StorageEvent) => {
      if (
        e.key === storage.physicalKey(PLAYER_KEYS.progress) ||
        e.key === null
      ) {
        const merged = mergeProgress(
          progressRef.current,
          readProgress(storage),
        );
        if (JSON.stringify(merged) !== JSON.stringify(progressRef.current))
          changeProgress(merged);
      }
      if (e.key === storage.physicalKey(COMPANION_KEY) || e.key === null)
        setCompanion(readCompanion(progressRef.current.taps, storage));
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  useEffect(() => {
    if (!ownsOutfit(companion, outfit)) setOutfit("college");
  }, [companion, outfit]);
  useEffect(() => {
    if (game && mode !== "online")
      try {
        storage.setItem(
          SESSION_KEY,
          JSON.stringify({
            matchId,
            mode,
            state: game,
            chapter,
            human,
            difficulty,
          }),
        );
      } catch {
        toast("本机空间不足，无法保存这局棋");
      }
  }, [game, mode, chapter, human, difficulty, matchId, toast]);

  const speak = useCallback(
    (trigger: Trigger, _state?: GameState) => {
      const index =
        mode === "story"
          ? chapter
          : Math.min(5, progressRef.current.unlocked - 1);
      let pool = CHAPTERS[index].dialogues.filter(
        (d) => d.trigger === trigger && !usedDialogue.current.has(d.id),
      );
      if (!pool.length) {
        pool = CHAPTERS[index].dialogues.filter((d) => d.trigger === trigger);
        for (const d of pool) usedDialogue.current.delete(d.id);
      }
      const fresh = pool.filter((d) => d.id !== lastDialogue.current);
      if (fresh.length) pool = fresh;
      const d: Dialogue | undefined =
        pool[dialogueCursor.current++ % Math.max(1, pool.length)];
      if (!d) return;
      lastDialogue.current = d.id;
      usedDialogue.current.add(d.id);
      clearTapReaction();
      setConversation({ malfoy: d.malfoy, harry: d.harry });
      setFrame(d.frame);
      if (frameTimer.current) clearTimeout(frameTimer.current);
      frameTimer.current = setTimeout(() => setFrame(undefined), 4500);
    },
    [mode, chapter, clearTapReaction],
  );

  const dispatch = useCallback(
    (action: Action) => {
      const state = gameRef.current;
      if (!state) return;
      setSelected(null);
      setSelectedCard(null);
      setSpellTargets([]);
      setPromotion(null);
      if (mode === "online") {
        if (pendingRef.current || !roomRef.current) return;
        pendingRef.current = true;
        setPending(true);
        if (
          !roomClient.current?.act(
            action,
            state.version,
            roomRef.current.room.matchId,
          )
        ) {
          pendingRef.current = false;
          setPending(false);
        }
      } else {
        try {
          const next = applyAction(state, action);
          if (mode === "local" && next.turn !== state.turn && !next.result)
            setHandover(true);
          gameRef.current = next;
          setGame(next);
        } catch (e) {
          toast(e instanceof Error ? e.message : "操作失败");
        }
      }
    },
    [mode, toast],
  );
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const w = new Worker(new URL("./ai/worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (event) => {
      const r = request.current;
      if (!r || event.data.id !== r.id) return;
      request.current = null;
      setAiThinking(false);
      setHintThinking(false);
      if (
        r.session !== sessionRef.current ||
        r.version !== gameRef.current?.version
      )
        return;
      if (event.data.error || !event.data.action) {
        toast("这一步需要再想想，请点击“重新思考”");
        return;
      }
      const a = event.data.action as Action;
      if (r.kind === "ai") dispatchRef.current(a);
      else if (a.type === "move") {
        setSelected(a.move.from);
        toast(
          `试试 ${squareName(a.move.from)} → ${squareName(a.move.to)}。最后一步由你决定。`,
        );
      } else if (a.type === "cast") {
        setSelectedCard(a.cast.cardId);
        setSpellTargets(a.cast.targets);
        const c = gameRef.current!.hands[gameRef.current!.turn].find(
          (c) => c.id === a.cast.cardId,
        );
        toast(
          `试试${c ? spellById[c.spell].name : "这张魔法"}，然后寻找合适的落点。`,
        );
      }
    };
    w.onerror = () => {
      request.current = null;
      setAiThinking(false);
      setHintThinking(false);
      toast("电脑思考暂时中断，可重新思考或重开这一局");
    };
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, [toast]);

  useEffect(() => {
    const client = new RoomClient();
    roomClient.current = client;
    setHasRoomSave(!!client.saved());
    client.onStatus = setConnection;
    client.onError = (message) => {
      pendingRef.current = false;
      setPending(false);
      toast(message);
    };
    client.onState = (snapshot) => {
      const previous = roomRef.current;
      if (previous && previous.room.matchId !== snapshot.room.matchId) {
        setSessionId((n) => n + 1);
        processedEvent.current = "";
        resultSeen.current = false;
      }
      roomRef.current = snapshot;
      setRoom(snapshot);
      setHuman(snapshot.playerColor);
      setGame(snapshot.state);
      gameRef.current = snapshot.state;
      pendingRef.current = false;
      setPending(false);
      setHasRoomSave(true);
    };
    return () => client.close();
  }, [toast]);

  const isAI = mode === "story" || mode === "ai" || mode === "trial";
  const storyDone =
    !!game && mode === "story" && chapterComplete(chapter, game);
  const myTurn = !!game && (mode === "local" || game.turn === human);
  useEffect(() => {
    setDiscardVisible(false);
    if (game?.phase !== "discard") return;
    const timer = setTimeout(
      () => setDiscardVisible(true),
      comfort ? 200 : 650,
    );
    return () => clearTimeout(timer);
  }, [game?.phase, sessionId, comfort]);
  const playable =
    !!game &&
    screen === "game" &&
    !overlay &&
    !game.result &&
    !storyDone &&
    !handover &&
    !pending &&
    myTurn &&
    (mode !== "online" || connection === "connected") &&
    game.phase !== "discard";
  const moves = useMemo(
    () =>
      game && selected !== null && !selectedCard
        ? legalMoves(game, selected)
        : [],
    [game, selected, selectedCard],
  );
  const ruleView = useMemo(
    () =>
      game && mode === "online"
        ? rulesForViewer(game, human, room?.enemyHandCount ?? 0)
        : game,
    [game, mode, human, room?.enemyHandCount],
  );
  const casts = useMemo(
    () =>
      ruleView && selectedCard ? possibleCasts(ruleView, selectedCard) : [],
    [ruleView, selectedCard],
  );
  const castHighlights = useMemo(
    () =>
      casts
        .filter((c) => spellTargets.every((at, i) => c.targets[i] === at))
        .map((c) => c.targets[spellTargets.length])
        .filter((at): at is number => at !== undefined),
    [casts, spellTargets],
  );
  const currentCard =
    game && selectedCard
      ? game.hands[game.turn].find((c) => c.id === selectedCard)
      : null;
  const castReady =
    !!currentCard &&
    casts.some(
      (c) =>
        c.targets.length === spellTargets.length &&
        c.targets.every((at, i) => at === spellTargets[i]),
    );

  useEffect(() => {
    if (
      !game ||
      !isAI ||
      game.turn === human ||
      game.result ||
      storyDone ||
      overlay ||
      screen !== "game"
    )
      return;
    const id = ++requestId.current,
      version = game.version,
      session = sessionRef.current;
    setAiThinking(true);
    const timer = setTimeout(
      () => {
        request.current = { id, kind: "ai", version, session };
        worker.current?.postMessage({
          id,
          state: aiView(game),
          deterministic: mode === "trial",
          difficulty:
            mode === "story"
              ? "gentle"
              : mode === "trial"
                ? "normal"
                : difficulty,
        });
      },
      comfort ? 200 : 650,
    );
    const watchdog = setTimeout(() => {
      if (request.current?.id === id) {
        request.current = null;
        setAiThinking(false);
        toast("电脑思考超时，请重新思考");
      }
    }, 7000);
    return () => {
      clearTimeout(timer);
      clearTimeout(watchdog);
      if (request.current?.id === id) request.current = null;
      setAiThinking(false);
    };
  }, [
    game,
    isAI,
    human,
    difficulty,
    mode,
    overlay,
    screen,
    storyDone,
    comfort,
    aiRetry,
    toast,
  ]);

  useEffect(() => {
    if (!game || screen !== "game") return;
    const entry = game.history.at(-1),
      key = `${sessionId}:${game.history.length}:${entry?.type}:${entry?.from}:${entry?.to}`;
    if (entry && key !== processedEvent.current) {
      processedEvent.current = key;
      setLastEvent(entry);
      setEventId((n) => n + 1);
      setSelected(null);
      setSelectedCard(null);
      setSpellTargets([]);
      const kind =
        entry.type === "cast" ? "spell" : entry.captured ? "capture" : "move";
      if (kind === "capture" && view === "3d" && !comfort)
        setTimeout(() => audio.play("capture"), 200);
      else audio.play(kind);
      if (inCheck(game, mode === "local" ? game.turn : human) && !game.result)
        speak("check", game);
      else if (entry.color === human || mode === "local")
        speak(
          kind === "capture" ? "capture" : kind === "spell" ? "spell" : "move",
          game,
        );
      if (
        mode === "local" &&
        entry.type === "move" &&
        game.turn !== entry.color &&
        !game.result
      )
        setHandover(true);
    }
    if (mode === "story" && storyDone && !finished.current) {
      finished.current = true;
      audio.play("win");
      const next = {
        ...progressRef.current,
        unlocked: Math.max(
          progressRef.current.unlocked,
          Math.min(6, chapter + 2),
        ),
        chapter: Math.min(5, chapter + 1),
      };
      changeProgress(next);
      void collectOutfit(matchId);
      const activeSession = sessionRef.current;
      finishTimer.current = setTimeout(
        () => {
          if (sessionRef.current === activeSession) {
            setScene({ chapter, ending: true, line: 0 });
            setOverlay("scene");
          }
        },
        comfort ? 500 : 1250,
      );
      return;
    }
    if (game.result && !resultSeen.current && !storyDone) {
      resultSeen.current = true;
      if (game.result.winner === null || mode === "local") {
        if (frameTimer.current) clearTimeout(frameTimer.current);
        setFrame(7);
        clearTapReaction();
        setConversation({
          malfoy:
            game.result.winner === null
              ? "平分秋色。棋盘上谁也没让步，那就一起喝杯茶吧。"
              : `${game.result.winner === "white" ? "白方" : "黑方"}赢下了这一局。棋子收好，再陪我坐一会儿。`,
          harry: "好。输赢记在棋谱里，今晚留给我们。",
        });
      } else speak(game.result.winner === human ? "win" : "loss", game);
      if (
        game.result.winner !== null &&
        (mode === "local" || game.result.winner === human)
      )
        audio.play("win");
      setHandover(false);
      if (game.result.reason !== "resign")
        void collectOutfit(
          mode === "online" ? `room:${roomRef.current?.room.matchId}` : matchId,
        );
      const activeSession = sessionRef.current;
      finishTimer.current = setTimeout(
        () => {
          if (sessionRef.current === activeSession) setOverlay("result");
        },
        comfort ? 200 : 900,
      );
      if (mode === "trial") {
        const score = trialScore(game);
        if (score > 0) {
          changeProgress({
            ...progressRef.current,
            best: Math.max(progressRef.current.best, score),
          });
          if (isToyHost())
            void submitTrial(score)
              .then(() => {
                setRetryScore(null);
                toast("魔法试炼成绩已提交云端");
              })
              .catch((e) => {
                setRetryScore(score);
                toast(toyError(e));
              });
        }
      }
    }
  }, [game?.version, sessionId, screen]);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      pendingRef.current = false;
      setPending(false);
      roomClient.current?.send({ type: "sync" });
      toast("尚未收到确认，正在重新同步棋局");
    }, 10000);
    return () => clearTimeout(t);
  }, [pending, toast]);
  useEffect(() => {
    if (overlay !== "rank" || !isToyHost()) return;
    let cancelled = false;
    setRankLoading(true);
    setRankError("");
    fetchRanks()
      .then((data) => {
        if (!cancelled) setRanks(data);
      })
      .catch((e) => {
        if (!cancelled) setRankError(toyError(e));
      })
      .finally(() => {
        if (!cancelled) setRankLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [overlay]);

  function resetInteractionState() {
    if (frameTimer.current) clearTimeout(frameTimer.current);
    setFrame(undefined);
    clearTapReaction();
    dialogueCursor.current = 0;
    lastDialogue.current = "";
    setCameraReset((n) => n + 1);
    setMatchId(newMatchId());
    setReward(null);
    if (finishTimer.current) clearTimeout(finishTimer.current);
    setSessionId((n) => n + 1);
    setSelected(null);
    setSelectedCard(null);
    setSpellTargets([]);
    setPromotion(null);
    setLastEvent(null);
    finished.current = false;
    resultSeen.current = false;
    processedEvent.current = "";
    usedDialogue.current.clear();
    request.current = null;
    setAiThinking(false);
    pendingRef.current = false;
    setPending(false);
  }
  function startChapter(index: number) {
    roomClient.current?.close();
    setRoom(null);
    resetInteractionState();
    setMode("story");
    setHuman("white");
    setChapter(index);
    setFlipped(false);
    setHandover(false);
    setGame(chapterGame(index));
    setScreen("game");
    setScene({ chapter: index, ending: false, line: 0 });
    setOverlay("scene");
    changeProgress({ ...progressRef.current, chapter: index });
    setFrame(undefined);
  }
  function startFree(nextMode: "ai" | "local") {
    roomClient.current?.close();
    setRoom(null);
    resetInteractionState();
    setMode(nextMode);
    setHuman(setupColor);
    setDifficulty(setupDifficulty);
    setGame(createGame(rules));
    setFlipped(setupColor === "black" && nextMode === "ai");
    setHandover(nextMode === "local");
    setScreen("game");
    setOverlay(null);
    const line = CHAPTERS[
      Math.min(5, progressRef.current.unlocked - 1)
    ].dialogues.find((d) => d.trigger === "start")!;
    setConversation({ malfoy: line.malfoy, harry: line.harry });
    setFrame(line.frame);
  }
  function startTrial() {
    roomClient.current?.close();
    setRoom(null);
    resetInteractionState();
    setMode("trial");
    setHuman("white");
    setFlipped(false);
    setHandover(false);
    setGame(trialGame());
    setScreen("game");
    setOverlay(null);
    setConversation({
      malfoy: "同一副棋局，同一份考验。看看你能走出多漂亮的一局。",
      harry: "我会认真，也想让你为我骄傲。",
    });
  }
  function startOnline(create: boolean, resume = false) {
    if (isToyHost() && !import.meta.env.VITE_ROOM_SERVER) {
      toast("此 Toy 版本的好友棋室尚未开放，请先体验剧情、人机或同机双人。");
      return;
    }
    resetInteractionState();
    setMode("online");
    setRoom(null);
    setGame(null);
    setHandover(false);
    setScreen("game");
    setOverlay(null);
    if (resume) roomClient.current?.resume();
    else if (create) roomClient.current?.create(setupColor, rules);
    else roomClient.current?.join(roomCode);
  }
  function tapCharacter() {
    const next = {
        ...progressRef.current,
        taps: Math.min(100000, progressRef.current.taps + 1),
      },
      line = tapResponse(
        next.taps,
        tapCursor.current++,
        tapExpressionRef.current ??
          expressionFor(progressRef.current.taps, frame),
      );
    tapExpressionRef.current = line.expression;
    changeProgress(next);
    if (frameTimer.current) clearTimeout(frameTimer.current);
    setFrame(undefined);
    setTapExpression(line.expression);
    setConversation({ malfoy: line.malfoy, harry: line.harry });
    audio.play("tap");
    void addHeart(next.taps - 1, storage)
      .then(({ state }) => {
        companionRef.current = state;
        setCompanion(state);
      })
      .catch(() => toast("心动值未能保存，请检查浏览器存储"));
  }
  async function collectOutfit(id: string, retry = false) {
    if (rewardAttempts.current.has(id) && !retry) return;
    rewardAttempts.current.add(id);
    try {
      const result = await claimOutfit(id, progressRef.current.taps, storage);
      companionRef.current = result.state;
      setCompanion(result.state);
      setPendingReward((pending) => (pending === id ? null : pending));
      if (result.value.outfit) {
        setReward(result.value.outfit);
        toast(
          `新衣装 · ${outfitById(result.value.outfit).name}，专属番外已开放`,
        );
      }
    } catch {
      setPendingReward(id);
      toast("衣装尚未保存，可在魔镜重试领取");
    }
  }
  function onSquare(at: number) {
    if (!playable || !game) return;
    if (selectedCard) {
      const prefix = [...spellTargets, at],
        matching = casts.filter((c) =>
          prefix.every((target, i) => c.targets[i] === target),
        );
      if (matching.length) setSpellTargets(prefix);
      else if (casts.some((c) => c.targets[0] === at)) setSpellTargets([at]);
      else toast("这里不是当前魔法的合法目标");
      return;
    }
    const destinations = moves.filter((m) => m.to === at);
    if (destinations.length > 1 && destinations.some((m) => m.promotion)) {
      setPromotion(destinations);
      return;
    }
    if (destinations[0]) {
      dispatch({ type: "move", move: destinations[0] });
      return;
    }
    if (game.board[at]?.color === game.turn)
      setSelected(selected === at ? null : at);
    else setSelected(null);
  }
  function selectCard(card: Card) {
    if (!playable || !game) return;
    if (game.phase !== "play") {
      toast("这回合已经施过法，现在走一步棋");
      return;
    }
    if (card.readyPly > game.ply) {
      toast("这张新牌要到你的下一回合才能使用");
      return;
    }
    if (!possibleCasts(ruleView ?? game, card.id, 1).length) {
      toast("当前没有合法目标，把这张牌留给更好的时机");
      return;
    }
    setSelected(null);
    setSelectedCard(selectedCard === card.id ? null : card.id);
    setSpellTargets([]);
  }
  function getHint() {
    if (!game || !myTurn || mode === "trial" || mode === "online") return;
    const id = ++requestId.current;
    request.current = {
      id,
      kind: "hint",
      version: game.version,
      session: sessionRef.current,
    };
    setHintThinking(true);
    worker.current?.postMessage({
      id,
      state: aiView(game),
      difficulty: "normal",
    });
  }
  function sceneNext() {
    const chapter = CHAPTERS[scene.chapter],
      lines = scene.ending ? chapter.closing : chapter.opening;
    if (scene.line + 1 < lines.length)
      setScene({ ...scene, line: scene.line + 1 });
    else {
      setOverlay(scene.ending ? "story" : null);
      if (!scene.ending) speak("start");
    }
  }
  const displayColor = mode === "local" ? (game?.turn ?? "white") : human;
  const enemyCount =
    mode === "online"
      ? (room?.enemyHandCount ?? 0)
      : (game?.hands[other(displayColor)].length ?? 0);
  const phaseText = !game
    ? "等待棋友"
    : game.result
      ? "对局结束"
      : game.phase === "discard"
        ? "选择保留的三张魔法"
        : pending
          ? "正在确认棋步"
          : aiThinking
            ? "对手正在思考"
            : !myTurn
              ? "等待对方落子"
              : game.phase === "move"
                ? "魔法已施放 · 现在走棋"
                : inCheck(game)
                  ? "你被将军了 · 寻找解围"
                  : "轮到你了 · 从容落子";
  const companionMoment: [string, string] = hintThinking
    ? ["她正在替你推演这一步…", "帮你想"]
    : game?.phase === "discard"
      ? ["先保留三张魔法，再继续约棋", "留三牌"]
      : handover
        ? ["等你们交接棋子", "待交接"]
        : pending
          ? ["正在确认棋步", "待确认"]
          : aiThinking
            ? human === "white"
              ? ["她正在斟酌下一步…", "她在想"]
              : ["对手正在思考 · 她陪你等", "等对手"]
            : selectedCard && currentCard
              ? [`准备施放 · ${spellById[currentCard.spell].name}`, "备施法"]
              : selected !== null && game?.board[selected]
                ? [
                    `${squareName(selected)} · ${pieceName[game.board[selected]!.kind]}已选好`,
                    `${squareName(selected)}选好`,
                  ]
                : game?.result
                  ? ["棋局已结束 · 再陪你坐一会儿", "已结束"]
                  : lastEvent
                    ? [`刚才 · ${lastEvent.text}`, "有棋谱"]
                    : myTurn
                      ? ["轮到你了 · 从容落子", "待落子"]
                      : ["等对方落子", "等棋友"];
  const boardProps = game
    ? {
        state: game,
        selected,
        targets: moves.map((m) => m.to),
        castTargets: [...castHighlights, ...spellTargets],
        flipped,
        comfort,
        onSquare,
        disabled: !playable,
        lastEvent,
        eventId,
      }
    : null;
  const categories = ["全部", "机动", "防御", "控制", "地形", "破局", "诡计"];

  return (
    <div
      className={`app ${comfort ? "reduce-motion" : ""} ${screen === "game" ? "in-game" : ""} ${screen === "journey" ? "in-journey" : ""} ${selected !== null || selectedCard ? "is-choosing" : ""}`}
    >
      <Starfield
        subdued={screen === "game" || screen === "journey"}
        comfort={comfort}
      />
      <header className="site-header">
        <button
          className="brand"
          onClick={() => setScreen("home")}
          aria-label="回到棋室主页"
        >
          <span className="brand-mark">
            <Icon name="crown" size={26} />
          </span>
          <span>
            <strong>巫师棋</strong>
            <small>与马尔福的甜蜜生活</small>
          </span>
        </button>
        <nav className="header-nav" aria-label="主导航">
          <button
            className={screen === "home" ? "active" : ""}
            onClick={() => setScreen("home")}
          >
            棋室
          </button>
          <button onClick={() => setOverlay("story")}>故事手札</button>
          <button onClick={() => setOverlay("spells")}>魔法图鉴</button>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            title="魔法试炼排行榜"
            aria-label="排行榜"
            onClick={() => setOverlay("rank")}
          >
            <Icon name="trophy" />
          </button>
          <button
            className="icon-button"
            title={sound ? "关闭声音" : "开启声音"}
            aria-label={sound ? "关闭声音" : "开启声音"}
            onClick={() => setSound(!sound)}
          >
            <Icon name={sound ? "volume" : "mute"} />
          </button>
          <button
            className="icon-button"
            title="设置"
            aria-label="设置"
            onClick={() => setOverlay("settings")}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>

      {screen === "journey" ? (
        <JourneyController
          key={storage.scope}
          storage={storage}
          companion={{
            outfit,
            taps: progress.taps,
            companion,
            onWardrobe: () => setOverlay("wardrobe"),
          }}
          onTap={tapCharacter}
          comfort={comfort}
          view={view}
          onViewChange={setView}
          onBack={() => setScreen("room")}
        />
      ) : screen !== "game" ? (
        <TitleScreen
          onJourney={() => {
            if (finishTimer.current) clearTimeout(finishTimer.current);
            request.current = null;
            setAiThinking(false);
            setHintThinking(false);
            setOverlay(null);
            setScreen("journey");
          }}
          journeyResume={(() => {
            try {
              const r = readJourney(storage).activeRun;
              return (
                !!r && (r.stage !== "home" || r.facts.at(-1)?.type !== "home")
              );
            } catch {
              return true;
            }
          })()}
          journeyKeepsake={(() => {
            try {
              const m = readJourney(storage).lastMemory;
              if (!m) return undefined;
              const tea = m.facts.find((f) => f.type === "tea");
              return {
                ribbon: m.keepsake === "ribbon",
                source:
                  tea?.type === "tea"
                    ? tea.choice === "offer"
                      ? "你递来的茶，她接住了。"
                      : "她留给你的茶，还温着。"
                    : "没倒完的茶，留给下次。",
              };
            } catch {
              return undefined;
            }
          })()}
          comfort={comfort}
          entered={screen === "room"}
          onEnter={() => setScreen("room")}
          onCover={() => setScreen("home")}
          frame={frame}
          expression={tapExpression}
          onChat={() => speak("date", game ?? undefined)}
          taps={progress.taps}
          outfit={outfit}
          onTap={tapCharacter}
          onStory={() =>
            startChapter(Math.min(progress.chapter, progress.unlocked - 1))
          }
          onContinue={() => {
            setScreen("game");
            setOverlay(null);
            if (mode === "local") setHandover(true);
          }}
          onAI={() => {
            setSetupMode("ai");
            setOverlay("setup");
          }}
          onLocal={() => {
            setSetupMode("local");
            setOverlay("setup");
          }}
          onOnline={() => setOverlay("online")}
          onGallery={() => setOverlay("gallery")}
          onRank={() => setOverlay("rank")}
          onBook={() => setOverlay("story")}
          onSpells={() => setOverlay("spells")}
          onWardrobe={() => setOverlay("wardrobe")}
          canContinue={!!game}
          conversation={conversation}
        />
      ) : (
        <main className="game-main">
          <div className="game-heading">
            <div>
              <button className="back-link" onClick={() => setScreen("room")}>
                <Icon name="left" size={16} />
                返回小屋
              </button>
              <h1>
                {mode === "story" ? CHAPTERS[chapter].title : modeNames[mode]}
              </h1>
              <p>
                {mode === "story"
                  ? CHAPTERS[chapter].goal
                  : mode === "trial"
                    ? "固定局面 · 固定难度 · 同样的魔法种子"
                    : mode === "online"
                      ? `房间 ${room?.room.code ?? "连接中"} · 好友之间的认真较量`
                      : game?.rules === "classic"
                        ? "经典规则"
                        : "魔法规则"}
              </p>
            </div>
            <div className="game-toolbar">
              <div className="segmented" aria-label="棋盘视图">
                <button
                  className={view === "3d" ? "active" : ""}
                  onClick={() => setView("3d")}
                >
                  <Icon name="box" size={16} />
                  3D
                </button>
                <button
                  className={view === "2d" ? "active" : ""}
                  onClick={() => setView("2d")}
                >
                  <Icon name="grid" size={16} />
                  2D
                </button>
              </div>
              <button
                className="icon-button"
                aria-label="翻转棋盘"
                title="翻转棋盘"
                onClick={() => setFlipped(!flipped)}
              >
                <Icon name="flip" />
              </button>
              {view === "3d" && (
                <button
                  className="button compact camera-button"
                  aria-label="复位战术镜头"
                  onClick={() => setCameraReset((n) => n + 1)}
                >
                  <Icon name="refresh" size={17} />
                  复位镜头
                </button>
              )}
              <button
                className="icon-button"
                aria-label="查看规则"
                onClick={() => setOverlay("rules")}
              >
                <Icon name="help" />
              </button>
            </div>
          </div>
          <div className="play-layout">
            <section className="chess-panel" aria-label="对局区域">
              {mode === "online" && !room?.state ? (
                <div className="room-lobby">
                  <span className="lobby-mark">
                    <Icon name="network" size={48} />
                  </span>
                  <p className="eyebrow">PRIVATE CHESS ROOM</p>
                  <h2>
                    {room
                      ? "椅子已经留好，等你的棋友"
                      : connection === "disconnected"
                        ? "暂时没有连接上棋室"
                        : "正在点亮棋室的烛火…"}
                  </h2>
                  {room ? (
                    <>
                      <button
                        className="room-code"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(room.room.code)
                            .then(() => toast("房间码已复制"))
                            .catch(() => toast(`房间码：${room.room.code}`));
                        }}
                      >
                        {room.room.code}
                        <Icon name="copy" size={19} />
                      </button>
                      <div className="lobby-players">
                        {room.room.players.map((p) => (
                          <div key={p.color}>
                            <Icon
                              name={p.color === "white" ? "crown" : "wand"}
                              size={24}
                            />
                            <strong>
                              {p.color === "white"
                                ? "白方 · 哈利"
                                : "黑方 · 马尔福"}
                            </strong>
                            <small>
                              {!p.joined
                                ? "等待加入"
                                : p.ready
                                  ? "已准备"
                                  : "等待准备"}
                            </small>
                          </div>
                        ))}
                      </div>
                      <button
                        className="button primary"
                        disabled={connection !== "connected"}
                        onClick={() =>
                          roomClient.current?.send({
                            type: "ready",
                            ready: !room.room.players.find(
                              (p) => p.color === human,
                            )?.ready,
                          })
                        }
                      >
                        {room.room.players.find((p) => p.color === human)?.ready
                          ? "取消准备"
                          : "我准备好了"}
                        <Icon name="check" size={17} />
                      </button>
                      <p className="muted">
                        把房间码告诉朋友，双方准备后开局。
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="muted">
                        好友对战需要在线房间服务；正在尝试连接。
                      </p>
                      <button
                        className="button"
                        onClick={() => setOverlay("online")}
                      >
                        重新加入
                      </button>
                    </>
                  )}
                </div>
              ) : game && boardProps ? (
                <>
                  <div className="player-bar opponent">
                    <span
                      className={`player-avatar ${displayColor === "black" ? "harry" : "malfoy-mini"}`}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>
                        {displayColor === "white"
                          ? "德拉科 · 马尔福"
                          : "哈利 · 波特"}
                      </strong>
                      <small>
                        {mode === "online"
                          ? room?.room.players.find(
                              (p) => p.color === other(human),
                            )?.online
                            ? "棋友在线"
                            : "棋友离线 · 保留座位五分钟"
                          : mode === "local"
                            ? "另一位棋友"
                            : difficultyNames[
                                mode === "story"
                                  ? "gentle"
                                  : mode === "trial"
                                    ? "normal"
                                    : difficulty
                              ]}
                      </small>
                    </div>
                    <span
                      className="hidden-cards"
                      aria-label={`对手${enemyCount}张魔法`}
                    >
                      {Array.from({ length: enemyCount }, (_, i) => (
                        <i key={i} />
                      ))}
                    </span>
                  </div>
                  <div className={`board-stage view-${view}`}>
                    {game.hands[other(displayColor)].some((card) =>
                      game.revealed[other(displayColor)].includes(card.id),
                    ) && (
                      <div
                        className="revealed-spells"
                        aria-label="已显露的对手魔法"
                      >
                        <Icon name="eye" size={13} />
                        {game.hands[other(displayColor)]
                          .filter((card) =>
                            game.revealed[other(displayColor)].includes(
                              card.id,
                            ),
                          )
                          .map((card) => (
                            <span key={card.id}>
                              {spellById[card.spell].name}
                            </span>
                          ))}
                      </div>
                    )}
                    {view === "2d" ? (
                      <Board2D key={sessionId} {...boardProps} />
                    ) : (
                      <Suspense
                        fallback={
                          <div className="board-loading">
                            <span className="loading-rune" />
                            <p>石雕正在苏醒…</p>
                          </div>
                        }
                      >
                        <Board3D
                          cameraReset={cameraReset}
                          key={sessionId}
                          {...boardProps}
                          onFailure={() => {
                            setView("2d");
                            toast("3D 暂不可用，已切换平面棋盘");
                          }}
                        />
                      </Suspense>
                    )}
                    {handover && !overlay && (
                      <div
                        className="handover"
                        role="dialog"
                        aria-modal="true"
                        aria-label="交接回合"
                      >
                        <Icon name="users" size={36} />
                        <h2>
                          请交给{game.turn === "white" ? "白方" : "黑方"}棋友
                        </h2>
                        <p>手牌已收好，等你准备好了再揭开。</p>
                        <button
                          autoFocus
                          className="button primary"
                          onClick={() => setHandover(false)}
                        >
                          我已接手 <Icon name="right" size={17} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="turn-bar">
                    <span className={`turn-dot ${game.turn}`} />
                    <strong>{phaseText}</strong>
                    <small>第 {Math.floor(game.ply / 2) + 1} 回合</small>
                  </div>
                  {selectedCard && currentCard ? (
                    <div className="spell-confirm">
                      <Icon name={spellById[currentCard.spell].icon} />
                      <div>
                        <strong>{spellById[currentCard.spell].name}</strong>
                        <p>{spellById[currentCard.spell].description}</p>
                        <small>
                          {castReady
                            ? "目标已选好，确认后消耗魔法。"
                            : spellTargets.length
                              ? "再选一个发光的落点"
                              : "选择棋盘上发光的目标"}
                        </small>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelectedCard(null);
                          setSpellTargets([]);
                        }}
                      >
                        取消
                      </button>
                      <button
                        className="button primary compact"
                        disabled={!castReady}
                        onClick={() =>
                          dispatch({
                            type: "cast",
                            cast: {
                              cardId: selectedCard,
                              targets: spellTargets,
                            },
                          })
                        }
                      >
                        施放
                      </button>
                    </div>
                  ) : (
                    <div className="hand-tray" aria-label="你的魔法手牌">
                      <div className="hand-label">
                        <Icon name="wand" size={16} />
                        <span>
                          {game.rules === "classic" ? "经典巫师棋" : "你的魔法"}
                        </span>
                        <small>
                          {game.rules === "classic"
                            ? "棋子动起来，规则保持经典。"
                            : "每回合最多一张 · 施法后走棋"}
                        </small>
                      </div>
                      <div className="hand-cards">
                        {game.rules === "magic" && !handover && myTurn ? (
                          game.hands[game.turn].map((card) => (
                            <button
                              key={card.id}
                              className={`spell-card tone-${spellById[card.spell].tone} ${card.readyPly > game.ply ? "not-ready" : ""}`}
                              disabled={!playable}
                              onClick={() => selectCard(card)}
                              title={spellById[card.spell].description}
                              aria-label={`${spellById[card.spell].name} ${spellById[card.spell].category}`}
                            >
                              <SpellArt spell={card.spell} />
                              <span className="card-sigil">
                                <Icon
                                  name={spellById[card.spell].icon}
                                  size={17}
                                />
                              </span>
                              <span>
                                <strong>{spellById[card.spell].name}</strong>
                                <small>
                                  {card.readyPly > game.ply
                                    ? "下回合可用"
                                    : spellById[card.spell].category}
                                </small>
                              </span>
                            </button>
                          ))
                        ) : game.rules === "magic" ? (
                          <p className="hand-private">
                            <Icon name="lock" size={17} />
                            手牌只向当前操作者展开
                          </p>
                        ) : null}
                        {game.rules === "magic" &&
                          myTurn &&
                          !handover &&
                          game.hands[game.turn].length === 0 && (
                            <p className="muted">
                              击毁敌方非兵棋子，获得新的魔法。
                            </p>
                          )}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </section>
            <div className="companion-column">
              <MirrorCompanion
                outfit={outfit}
                taps={progress.taps}
                frame={frame}
                expression={tapExpression}
                companion={companion}
                conversation={conversation}
                moment={companionMoment[0]}
                compactMoment={companionMoment[1]}
                onTap={tapCharacter}
                onChat={() => speak("date", game ?? undefined)}
                onWardrobe={() => setOverlay("wardrobe")}
                onHistory={() => setOverlay("history")}
                onHint={isAI ? getHint : undefined}
                hintDisabled={
                  !myTurn ||
                  hintThinking ||
                  mode === "trial" ||
                  !!game?.result ||
                  storyDone
                }
                reward={reward}
                onTryReward={() => {
                  if (reward) setOutfit(reward);
                }}
                pendingReward={!!pendingReward}
                onRetry={() => {
                  if (pendingReward) void collectOutfit(pendingReward, true);
                }}
              />
              {isAI &&
                !myTurn &&
                !aiThinking &&
                !game?.result &&
                !storyDone && (
                  <button
                    className="button compact"
                    onClick={() => setAiRetry((n) => n + 1)}
                  >
                    重新思考
                  </button>
                )}
              {mode === "online" && (
                <div className={`connection-note ${connection}`}>
                  <span />
                  {connection === "connected"
                    ? "已连接"
                    : connection === "reconnecting"
                      ? "重连中"
                      : "已断开"}
                  <button
                    aria-label="离开房间"
                    onClick={() => {
                      roomClient.current?.close(true);
                      setRoom(null);
                      setGame(null);
                      setHasRoomSave(false);
                      setScreen("home");
                    }}
                  >
                    <Icon name="exit" size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {overlay === "wardrobe" && (
        <Wardrobe
          companion={companion}
          equipped={outfit}
          onEquip={setOutfit}
          onStory={(id) => {
            setStoryOutfit(id);
            setOverlay("outfit-story");
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === "outfit-story" && ownsOutfit(companion, storyOutfit) && (
        <OutfitStory
          key={storyOutfit}
          outfit={storyOutfit}
          onClose={() => setOverlay("wardrobe")}
        />
      )}
      {overlay === "gallery" && (
        <Modal
          title="回忆画廊"
          eyebrow="MOMENTS WITH YOU"
          onClose={() => setOverlay(null)}
          wide
        >
          <div className="gallery-feature">
            <img
              src={
                galleryIndex < 6
                  ? CG[galleryIndex]
                  : [ART.proud, ART.shy, ART.casting, ART.gala][
                      galleryIndex - 6
                    ]
              }
              alt={
                galleryIndex < 6 ? CG_NAMES[galleryIndex] : "成年马尔福全身立绘"
              }
            />
            <span>
              {galleryIndex < 6
                ? CG_NAMES[galleryIndex]
                : ["傲娇棋友", "藏不住的心事", "魔法的瞬间", "翡翠之夜"][
                    galleryIndex - 6
                  ]}
            </span>
          </div>
          <div className="gallery-thumbs">
            {[...CG, ART.proud, ART.shy, ART.casting, ART.gala].map(
              (url, i) => (
                <button
                  key={url}
                  className={i === galleryIndex ? "active" : ""}
                  onClick={() => setGalleryIndex(i)}
                  aria-label={`查看回忆${i + 1}`}
                >
                  <img src={url} alt="" loading="lazy" />
                </button>
              ),
            )}
          </div>
          <div className="outfit-options">
            <span>棋厅装束</span>
            <button onClick={() => setOverlay("wardrobe")}>
              衣装与专属番外
            </button>
            <button
              className={outfit === "college" ? "active" : ""}
              onClick={() => setOutfit("college")}
            >
              绿银学院
            </button>
            <button
              className={outfit === "gala" ? "active" : ""}
              onClick={() => setOutfit("gala")}
            >
              翡翠晚宴
            </button>
          </div>
        </Modal>
      )}
      {overlay === "history" && (
        <Modal
          title="棋局手札"
          eyebrow={`${game?.history.filter((e) => e.type === "move").length ?? 0} 步`}
          onClose={() => setOverlay(null)}
        >
          <ol className="history-list">
            {game?.history.slice(-40).map((entry, i) => (
              <li key={i}>
                <span>{entry.color === "white" ? "白" : "黑"}</span>
                {entry.text}
              </li>
            ))}
          </ol>
          <button className="button full" onClick={() => setOverlay("spells")}>
            魔法图鉴
            <Icon name="wand" />
          </button>
        </Modal>
      )}
      {overlay === "story" && (
        <Modal
          title="六封冬日情书"
          eyebrow="OUR LITTLE CHESS STORY"
          onClose={() => setOverlay(null)}
          wide
        >
          <p className="modal-description">
            从一句“波特”，到每一局都坐你身边。
          </p>
          <div className="chapter-grid">
            {CHAPTERS.map((c) => (
              <button
                key={c.id}
                className={`chapter-card ${c.id + 1 > progress.unlocked ? "locked" : ""}`}
                disabled={c.id + 1 > progress.unlocked}
                onClick={() => startChapter(c.id)}
              >
                <div
                  className="chapter-art"
                  style={{ backgroundImage: `url(${CG[c.id]})` }}
                />
                <div>
                  <span>
                    CHAPTER 0{c.id + 1}
                    {c.id + 1 > progress.unlocked && (
                      <Icon name="lock" size={13} />
                    )}
                  </span>
                  <strong>{c.title}</strong>
                  <small>{c.subtitle}</small>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {overlay === "setup" && (
        <Modal
          title={setupMode === "ai" ? "和她认真下一局" : "把棋盘放在你们中间"}
          eyebrow="MAKE YOURSELF COMFORTABLE"
          onClose={() => setOverlay(null)}
        >
          <div className="option-group">
            <span>棋局规则</span>
            <div className="choice-row">
              <button
                className={rules === "magic" ? "chosen" : ""}
                onClick={() => setRules("magic")}
              >
                <Icon name="wand" />
                魔法技能棋<small>随机魔法，出其不意</small>
              </button>
              <button
                className={rules === "classic" ? "chosen" : ""}
                onClick={() => setRules("classic")}
              >
                <Icon name="crown" />
                经典巫师棋<small>纯粹棋艺，石雕较量</small>
              </button>
            </div>
          </div>
          {setupMode === "ai" && (
            <>
              <label className="field-label">
                今天想怎样较量
                <select
                  value={setupDifficulty}
                  onChange={(e) =>
                    setSetupDifficulty(e.target.value as Difficulty)
                  }
                >
                  {Object.entries(difficultyNames).map(([key, name]) => (
                    <option value={key} key={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="option-group">
                <span>选择执子</span>
                <div className="segmented stretch">
                  <button
                    className={setupColor === "white" ? "active" : ""}
                    onClick={() => setSetupColor("white")}
                  >
                    白方 · 先手
                  </button>
                  <button
                    className={setupColor === "black" ? "active" : ""}
                    onClick={() => setSetupColor("black")}
                  >
                    黑方 · 后手
                  </button>
                </div>
              </div>
            </>
          )}
          <button
            className="button primary full"
            onClick={() => startFree(setupMode)}
          >
            棋子就位，开始吧 <Icon name="right" />
          </button>
          {setupMode === "ai" && (
            <button className="trial-link" onClick={startTrial}>
              <Icon name="trophy" />
              试试魔法试炼 · 挑战最佳纪录
              <Icon name="chevron" size={15} />
            </button>
          )}
        </Modal>
      )}
      {overlay === "online" && (
        <Modal
          title="隔着距离，也能同桌"
          eyebrow="A PRIVATE ROOM FOR TWO"
          onClose={() => setOverlay(null)}
        >
          <p className="modal-description">
            创建一间棋室，把六位房间码告诉朋友。
          </p>
          <div className="option-group">
            <span>创建房间的规则</span>
            <div className="segmented stretch">
              <button
                className={rules === "magic" ? "active" : ""}
                onClick={() => setRules("magic")}
              >
                魔法技能棋
              </button>
              <button
                className={rules === "classic" ? "active" : ""}
                onClick={() => setRules("classic")}
              >
                经典巫师棋
              </button>
            </div>
          </div>
          <div className="option-group">
            <span>你的执子</span>
            <div className="segmented stretch">
              <button
                className={setupColor === "white" ? "active" : ""}
                onClick={() => setSetupColor("white")}
              >
                白方
              </button>
              <button
                className={setupColor === "black" ? "active" : ""}
                onClick={() => setSetupColor("black")}
              >
                黑方
              </button>
            </div>
          </div>
          <button
            className="button primary full"
            onClick={() => startOnline(true)}
          >
            为我们留一间棋室 <Icon name="network" />
          </button>
          <div className="or-divider">
            <span />
            或者加入朋友的棋室
            <span />
          </div>
          <label className="field-label">
            六位房间码
            <input
              value={roomCode}
              maxLength={6}
              onChange={(e) =>
                setRoomCode(
                  e.target.value.toUpperCase().replace(/[^A-F0-9]/g, ""),
                )
              }
              placeholder="例如 A1B2C3"
              autoComplete="off"
            />
          </label>
          <button
            className="button full"
            disabled={roomCode.length !== 6}
            onClick={() => startOnline(false)}
          >
            加入棋室 <Icon name="right" />
          </button>
          {hasRoomSave && (
            <button
              className="trial-link"
              onClick={() => startOnline(false, true)}
            >
              <Icon name="redo" />
              恢复上次的好友座位
            </button>
          )}
          <p className="fine-print">
            短暂掉线保留座位五分钟。双方准备后开始；好友局不计入试炼榜。
          </p>
        </Modal>
      )}
      {overlay === "settings" && (
        <Modal
          title="让这一局更舒服"
          eyebrow="A LITTLE MORE YOUR WAY"
          onClose={() => setOverlay(null)}
        >
          <div className="setting-row">
            <div>
              <strong>减少动态效果</strong>
              <p>关闭自动动态与震屏，仍可主动旋转镜头。</p>
            </div>
            <button
              className={`switch ${comfort ? "on" : ""}`}
              role="switch"
              aria-checked={comfort}
              aria-label="减少动态效果"
              onClick={() => setComfort(!comfort)}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>原创配乐与魔法音效</strong>
              <p>柔和的原创魔法旋律、石材碎裂与轻盈提示。</p>
            </div>
            <button
              className={`switch ${sound ? "on" : ""}`}
              role="switch"
              aria-checked={sound}
              aria-label="魔法与击毁音效"
              onClick={() => setSound(!sound)}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>默认棋盘视图</strong>
              <p>平面棋盘保留全部玩法与角色互动。</p>
            </div>
            <div className="segmented">
              <button
                className={view === "3d" ? "active" : ""}
                onClick={() => setView("3d")}
              >
                3D
              </button>
              <button
                className={view === "2d" ? "active" : ""}
                onClick={() => setView("2d")}
              >
                2D
              </button>
            </div>
          </div>
          <div className="setting-row">
            <label htmlFor="music-volume">配乐音量</label>
            <input
              id="music-volume"
              aria-label="配乐音量"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={musicVolume}
              onChange={(e) => setMusicVolume(Number(e.target.value))}
            />
            <span>{Math.round(musicVolume * 100)}%</span>
          </div>
          <div className="save-box">
            <Icon name={isToyHost() ? "cloud" : "save"} size={24} />
            <SaveControls />
          </div>
          <p className="fine-print">
            本作品为成年返校 AU
            同人创作。角色点击互动不会改变棋力、技能概率或排行榜分数。
          </p>
        </Modal>
      )}
      {overlay === "rules" && (
        <Modal
          title="棋局开始前的小约定"
          eyebrow="THE RULES OF OUR GAME"
          onClose={() => setOverlay(null)}
        >
          <ol className="rules-list">
            <li>
              <strong>将死，才是终点。</strong>
              <p>
                遵循国际象棋基础走法，支持易位、吃过路兵与四种升变。国王不能被直接吃掉。
              </p>
            </li>
            <li>
              <strong>先施法，再走棋。</strong>
              <p>
                魔法棋每回合最多一张牌；施法可跳过。技能也能解将，但整回合结束时自己的国王必须安全。
              </p>
            </li>
            <li>
              <strong>三张手牌，留一点惊喜。</strong>
              <p>
                同池等概率抽取，不分稀有度。击毁非兵补一张，满手四留三；新牌下一回合可用，同一枚棋子只奖励一次。
              </p>
            </li>
            <li>
              <strong>看清效果的结束。</strong>
              <p>
                保护与控制通常持续到对方回合结束。系统会检查效果到期后的国王安全。
              </p>
            </li>
            <li>
              <strong>同一盘棋，两种看法。</strong>
              <p>
                随时切换 2D /
                3D，不会重新抽牌或重开棋局。喜欢安静的话，可以打开舒适模式。
              </p>
            </li>
          </ol>
          <button className="button full" onClick={() => setOverlay("spells")}>
            翻开魔法图鉴 <Icon name="book" />
          </button>
        </Modal>
      )}
      {overlay === "spells" && (
        <Modal
          title="一点魔法，很多可能"
          eyebrow="THE SPELLBOOK · 24 SPELLS"
          onClose={() => setOverlay(null)}
          wide
        >
          <label className="search-field">
            <Icon name="eye" size={18} />
            <input
              aria-label="搜索魔法"
              value={spellQuery}
              onChange={(e) => setSpellQuery(e.target.value)}
              placeholder="寻找一个咒语…"
            />
          </label>
          <div className="category-tabs">
            {categories.map((category) => (
              <button
                key={category}
                className={spellCategory === category ? "active" : ""}
                onClick={() => setSpellCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <SpellLibrary
            spells={SPELLS.filter(
              (s) =>
                (spellCategory === "全部" || s.category === spellCategory) &&
                `${s.name} ${s.latin}`
                  .toLowerCase()
                  .includes(spellQuery.toLowerCase()),
            )}
          />
          <p className="fine-print">
            咒语名称取材于原作；棋盘效果为本游戏改编。技能等概率抽取，强度仍需持续平衡。
          </p>
        </Modal>
      )}
      {overlay === "rank" && (
        <Modal
          title="留下一步漂亮的棋"
          eyebrow="THE MAGIC TRIAL LEADERBOARD"
          onClose={() => setOverlay(null)}
        >
          <div className="rank-intro">
            <Icon name="trophy" size={38} />
            <div>
              <strong>魔法试炼 · 最佳成绩</strong>
              <p>固定局面、固定难度、固定种子。赢下试炼，写下你的名字。</p>
            </div>
          </div>
          <div className="rank-source">
            <span className="status-dot-inline" />
            {isToyHost() ? "Toy 云端榜 · 总榜" : "本机纪录 · 当前浏览器"}
          </div>
          {isToyHost() ? (
            rankLoading ? (
              <p className="empty-state">正在翻阅云端手札…</p>
            ) : rankError ? (
              <div className="empty-state">
                <p>{rankError}</p>
                <button
                  className="button compact"
                  onClick={() => {
                    setRankLoading(true);
                    setRankError("");
                    fetchRanks()
                      .then(setRanks)
                      .catch((e) => setRankError(toyError(e)))
                      .finally(() => setRankLoading(false));
                  }}
                >
                  再试一次
                </button>
              </div>
            ) : ranks.length ? (
              <ol className="rank-list">
                {ranks.map((entry) => (
                  <li key={entry.rank}>
                    <span className="rank-number">
                      {String(entry.rank).padStart(2, "0")}
                    </span>
                    <strong>{entry.nickname}</strong>
                    <span>{entry.score}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-state">第一份纪录，等你写下。</p>
            )
          ) : progress.best ? (
            <div className="local-rank">
              <span>01</span>
              <div>
                <strong>你 · 本机棋友</strong>
                <small>魔法试炼最佳成绩</small>
              </div>
              <b>{progress.best}</b>
            </div>
          ) : (
            <p className="empty-state">
              还没有试炼纪录。
              <br />
              她已经把棋盘摆好了。
            </p>
          )}
          <button className="button primary full" onClick={startTrial}>
            赴一场魔法试炼 <Icon name="right" />
          </button>
          <p className="fine-print">
            胜局基础分 1000，吃子最多加 500，回合效率最多加
            300。恋爱互动与好友局不计分。Toy 云端提交需要平台登录。
          </p>
        </Modal>
      )}
      {overlay === "scene" && (
        <Modal
          title={CHAPTERS[scene.chapter].title}
          eyebrow={`CHAPTER 0${scene.chapter + 1} · ${scene.ending ? "这一封，写给你" : CHAPTERS[scene.chapter].location}`}
          onClose={() => {
            setOverlay(scene.ending ? "story" : null);
          }}
          wide
        >
          <div
            className="scene-art"
            style={{ backgroundImage: `url(${CG[scene.chapter]})` }}
          />
          <div className="scene-copy">
            <span>
              {
                (scene.ending
                  ? CHAPTERS[scene.chapter].closing
                  : CHAPTERS[scene.chapter].opening)[scene.line].speaker
              }
            </span>
            <p>
              {
                (scene.ending
                  ? CHAPTERS[scene.chapter].closing
                  : CHAPTERS[scene.chapter].opening)[scene.line].text
              }
            </p>
          </div>
          <div className="scene-bottom">
            <small>
              {scene.line + 1} /{" "}
              {
                (scene.ending
                  ? CHAPTERS[scene.chapter].closing
                  : CHAPTERS[scene.chapter].opening
                ).length
              }
            </small>
            <button
              className="text-button"
              onClick={() => setOverlay(scene.ending ? "story" : null)}
            >
              稍后再读
            </button>
            <button className="button primary" onClick={sceneNext}>
              {scene.line + 1 <
              (scene.ending
                ? CHAPTERS[scene.chapter].closing
                : CHAPTERS[scene.chapter].opening
              ).length
                ? "继续"
                : scene.ending
                  ? "下一次约棋"
                  : "开始这局棋"}
              <Icon name="right" size={17} />
            </button>
          </div>
        </Modal>
      )}
      {overlay === "result" && game?.result && (
        <Modal
          title={
            mode === "local"
              ? game.result.winner
                ? `${game.result.winner === "white" ? "白方" : "黑方"}赢下了这一局`
                : "这一局，平分秋色"
              : game.result.winner === human
                ? "漂亮的一局，棋友。"
                : game.result.winner
                  ? "下次，再一起认真一点。"
                  : "这一局，平分秋色"
          }
          eyebrow="ANOTHER MEMORY WITH YOU"
          onClose={() => setOverlay(null)}
        >
          <div className="result-emblem">
            <Icon
              name={game.result.winner === human ? "trophy" : "heart"}
              size={50}
            />
          </div>
          <p className="result-quote">“{conversation.malfoy}”</p>
          <p className="muted center">
            {
              {
                checkmate: "将死",
                stalemate: "逼和",
                repetition: "三次重复局面",
                "fifty-move": "五十回合无进展",
                insufficient: "子力不足",
                resign: "认输",
              }[game.result.reason]
            }{" "}
            · {Math.ceil(game.ply / 2)} 回合
          </p>
          {mode === "trial" && trialScore(game) > 0 && (
            <div className="score-result">
              <small>本次试炼成绩</small>
              <strong>{trialScore(game)}</strong>
              <span>
                {isToyHost() ? "最高分提交至 Toy 云端榜" : "本机最高分纪录"}
              </span>
            </div>
          )}
          {retryScore && isToyHost() && (
            <button
              className="button full"
              onClick={() =>
                void submitTrial(retryScore)
                  .then(() => {
                    setRetryScore(null);
                    toast("成绩已提交");
                  })
                  .catch((e) => toast(toyError(e)))
              }
            >
              重试云端成绩提交
            </button>
          )}
          <div className="two-buttons">
            <button
              className="button"
              onClick={() => {
                setOverlay(null);
                setScreen("home");
              }}
            >
              回到棋室
            </button>
            <button
              className="button primary"
              onClick={() =>
                mode === "online"
                  ? roomClient.current?.send({ type: "rematch" })
                  : mode === "story"
                    ? startChapter(chapter)
                    : mode === "trial"
                      ? startTrial()
                      : startFree(mode)
              }
            >
              {mode === "online" && room?.room.rematch.includes(human)
                ? "等待朋友同意"
                : "再下一局"}
            </button>
          </div>
        </Modal>
      )}
      {game?.phase === "discard" &&
        discardVisible &&
        myTurn &&
        !storyDone &&
        !overlay &&
        !handover && (
          <Modal
            title="四张魔法，留下三张"
            eyebrow="A LITTLE CHOICE"
            onClose={() => toast("请先选择一张要放回牌池的魔法")}
          >
            <p className="modal-description">
              点击一张放回牌池。带着另外三张，继续这场较量。
            </p>
            <div className="discard-grid">
              {game.hands[game.turn].map((card) => (
                <button
                  key={card.id}
                  className={`discard-card tone-${spellById[card.spell].tone}`}
                  onClick={() => dispatch({ type: "discard", cardId: card.id })}
                  disabled={pending}
                >
                  <Icon name={spellById[card.spell].icon} size={27} />
                  <strong>{spellById[card.spell].name}</strong>
                  <p>{spellById[card.spell].description}</p>
                  <small>
                    {card.readyPly > game.ply
                      ? "新牌 · 下回合可用"
                      : "放回这张"}
                  </small>
                </button>
              ))}
            </div>
          </Modal>
        )}
      {promotion && (
        <Modal
          title="让这一步，成为新的开始"
          eyebrow="PAWN PROMOTION"
          onClose={() => setPromotion(null)}
        >
          <p className="modal-description">选择兵的升变棋种。</p>
          <div className="promotion-options">
            {promotion.map((move) => (
              <button
                key={move.promotion}
                onClick={() => dispatch({ type: "move", move })}
              >
                <PieceIcon kind={move.promotion!} color={game!.turn} />
                <span>{pieceName[move.promotion!]}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Icon name="spark" size={17} />
          {notice}
        </div>
      )}
    </div>
  );
}
