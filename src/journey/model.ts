import { applyAction, clone, validateSavedGame } from "../domain/engine";
import type {
  Action,
  Card,
  Color,
  GameState,
  Kind,
  RecordEntry,
  SpellId,
} from "../domain/types";
import {
  createNodeGame,
  JOURNEY_NODES,
  preparationCards,
  type JourneyNodeId,
  type PreparationId,
} from "./catalog";

export type JourneyStage =
  "invite" | "playing" | "tea" | "route" | "between" | "retry" | "home";
export type JourneyOutcome = "complete" | "failed" | "abandoned";
export type HelpLevel = "threat" | "reason" | "demo";
export type TeaChoice = "offer" | "receive";
export type Keepsake = "ribbon" | "cup-mark";
export type JourneyFact =
  | { type: "prepared"; preparation: PreparationId }
  | { type: "invitation" }
  | {
      type: "move";
      nodeId: JourneyNodeId;
      ply: number;
      color: Color;
      from: number;
      to: number;
      captured?: Kind;
    }
  | {
      type: "cast";
      nodeId: JourneyNodeId;
      ply: number;
      color: Color;
      spell: SpellId;
      targets: number[];
    }
  | { type: "help"; nodeId: JourneyNodeId; level: HelpLevel }
  | { type: "tea"; choice: TeaChoice }
  | { type: "route"; firstNode: 1 | 2 }
  | {
      type: "node";
      nodeId: JourneyNodeId;
      result: "won" | "lost";
      reason: NonNullable<GameState["result"]>["reason"] | "limit";
    }
  | { type: "retry"; nodeId: JourneyNodeId }
  | { type: "abandon"; nodeId: JourneyNodeId }
  | { type: "home"; outcome: JourneyOutcome; keepsake: Keepsake };

export interface JourneyRun {
  id: string;
  seed: number;
  preparation: PreparationId;
  stage: JourneyStage;
  route: JourneyNodeId[];
  nodeIndex: JourneyNodeId;
  completedNodeIds: JourneyNodeId[];
  game: GameState | null;
  remainingHand: Card[];
  nodeEntryHand: Card[];
  whiteMoves: number;
  retriesUsed: 0 | 1;
  outcome: JourneyOutcome | null;
  facts: JourneyFact[];
}
export interface JourneyMemory {
  id: string;
  runId: string;
  outcome: JourneyOutcome;
  keepsake: Keepsake;
  facts: JourneyFact[];
}
export interface JourneyProgress {
  schema: 1;
  revision: number;
  activeRun: JourneyRun | null;
  memories: JourneyMemory[];
  lastMemory: JourneyMemory | null;
  appliedCommandIds: string[];
}
export type JourneyCommand = { commandId: string } & (
  | { type: "start"; runId: string; seed: number; preparation: PreparationId }
  | { type: "acceptInvitation" }
  | { type: "play"; action: Action; expectedGameVersion: number }
  | { type: "help"; level: HelpLevel }
  | { type: "retry" }
  | { type: "tea"; choice: TeaChoice }
  | { type: "route"; firstNode: 1 | 2 }
  | { type: "advance" }
  | { type: "abandon" }
  | { type: "finishHome"; keepsake: Keepsake }
);

export const initialJourneyProgress = (): JourneyProgress => ({
  schema: 1,
  revision: 0,
  activeRun: null,
  memories: [],
  lastMemory: null,
  appliedCommandIds: [],
});

const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const integer = (value: unknown, max = 1_000_000): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const nodeId = (value: unknown): value is JourneyNodeId =>
  value === 0 || value === 1 || value === 2;
const preparationId = (value: unknown): value is PreparationId =>
  value === "thread" || value === "still";
const outcome = (value: unknown): value is JourneyOutcome =>
  value === "complete" || value === "failed" || value === "abandoned";
const keepsake = (value: unknown): value is Keepsake =>
  value === "ribbon" || value === "cup-mark";
const fail = (): never => {
  throw new Error("棋旅存档无效");
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const cards = (hand: readonly Card[]) =>
  hand.map(({ id, spell, readyPly }) => ({ id, spell, readyPly }));

function memoryId(
  memory: Pick<JourneyMemory, "facts" | "outcome" | "keepsake">,
) {
  const tea = memory.facts.find((f) => f.type === "tea");
  return [
    "journey",
    memory.keepsake,
    memory.outcome,
    tea?.type === "tea" ? tea.choice : "before-tea",
  ].join(":");
}

function cleanGame(s: GameState): GameState {
  const piece = (p: NonNullable<GameState["board"][number]>) => ({
    id: p.id,
    color: p.color,
    kind: p.kind,
    origin: p.origin,
    moved: p.moved,
    effects: p.effects.map(({ type, until, source }) => ({
      type,
      until,
      source,
    })),
  });
  return {
    schema: 1,
    board: s.board.map((p) => p && piece(p)),
    turn: s.turn,
    ply: s.ply,
    version: s.version,
    phase: s.phase,
    rules: s.rules,
    rng: s.rng,
    cardSerial: s.cardSerial,
    hands: { white: cards(s.hands.white), black: cards(s.hands.black) },
    revealed: { white: [...s.revealed.white], black: [...s.revealed.black] },
    tiles: s.tiles.map(({ square, type, until, owner }) => ({
      square,
      type,
      until,
      owner,
    })),
    grave: s.grave.map((g) => ({ piece: piece(g.piece), square: g.square })),
    rewarded: [...s.rewarded],
    ep: s.ep && {
      square: s.ep.square,
      pawnSquare: s.ep.pawnSquare,
      pawnId: s.ep.pawnId,
    },
    halfmove: s.halfmove,
    repetitions: { ...s.repetitions },
    history: s.history.map((h) => {
      const clean: RecordEntry = {
        ply: h.ply,
        color: h.color,
        type: h.type,
        text: h.text,
      };
      for (const key of [
        "from",
        "to",
        "captured",
        "capturedId",
        "spell",
      ] as const)
        if (h[key] !== undefined) Object.assign(clean, { [key]: h[key] });
      return clean;
    }),
    result: s.result && { winner: s.result.winner, reason: s.result.reason },
  };
}

function decodeCards(input: unknown, preparation: PreparationId): Card[] {
  if (!Array.isArray(input) || input.length > 3) return fail();
  const allowed = preparationCards(preparation);
  const ids = new Set<string>();
  return input.map((entry) => {
    if (
      !object(entry) ||
      !allowed.some(
        (card) => card.id === entry.id && card.spell === entry.spell,
      ) ||
      entry.readyPly !== 0 ||
      ids.has(entry.id as string)
    )
      return fail();
    ids.add(entry.id as string);
    return {
      id: entry.id as string,
      spell: entry.spell as SpellId,
      readyPly: 0,
    };
  });
}

function decodeFacts(input: unknown): JourneyFact[] {
  if (!Array.isArray(input) || input.length > 256) return fail();
  return input.map((x): JourneyFact => {
    if (!object(x)) return fail();
    switch (x.type) {
      case "prepared":
        if (preparationId(x.preparation))
          return { type: x.type, preparation: x.preparation };
        break;
      case "invitation":
        return { type: x.type };
      case "move": {
        if (
          nodeId(x.nodeId) &&
          integer(x.ply, 20) &&
          (x.color === "white" || x.color === "black") &&
          integer(x.from, 63) &&
          integer(x.to, 63) &&
          (x.captured === undefined ||
            ["p", "n", "b", "r", "q"].includes(x.captured as string))
        ) {
          const value: JourneyFact = {
            type: x.type,
            nodeId: x.nodeId,
            ply: x.ply,
            color: x.color,
            from: x.from,
            to: x.to,
          };
          if (x.captured !== undefined) value.captured = x.captured as Kind;
          return value;
        }
        break;
      }
      case "cast":
        if (
          nodeId(x.nodeId) &&
          integer(x.ply, 20) &&
          (x.color === "white" || x.color === "black") &&
          (x.spell === "accio" || x.spell === "petrificus") &&
          Array.isArray(x.targets) &&
          x.targets.length === (x.spell === "accio" ? 2 : 1) &&
          x.targets.every((at) => integer(at, 63))
        )
          return {
            type: x.type,
            nodeId: x.nodeId,
            ply: x.ply,
            color: x.color,
            spell: x.spell,
            targets: [...x.targets],
          };
        break;
      case "help":
        if (
          nodeId(x.nodeId) &&
          ["threat", "reason", "demo"].includes(x.level as string)
        )
          return {
            type: x.type,
            nodeId: x.nodeId,
            level: x.level as HelpLevel,
          };
        break;
      case "tea":
        if (x.choice === "offer" || x.choice === "receive")
          return { type: x.type, choice: x.choice };
        break;
      case "route":
        if (x.firstNode === 1 || x.firstNode === 2)
          return { type: x.type, firstNode: x.firstNode };
        break;
      case "node":
        if (
          nodeId(x.nodeId) &&
          (x.result === "won" || x.result === "lost") &&
          [
            "checkmate",
            "stalemate",
            "repetition",
            "fifty-move",
            "insufficient",
            "resign",
            "limit",
          ].includes(x.reason as string)
        )
          return {
            type: x.type,
            nodeId: x.nodeId,
            result: x.result,
            reason: x.reason as Extract<
              JourneyFact,
              { type: "node" }
            >["reason"],
          };
        break;
      case "retry":
      case "abandon":
        if (nodeId(x.nodeId)) return { type: x.type, nodeId: x.nodeId };
        break;
      case "home":
        if (outcome(x.outcome) && keepsake(x.keepsake))
          return { type: x.type, outcome: x.outcome, keepsake: x.keepsake };
    }
    return fail();
  });
}

function decodeRun(input: unknown): JourneyRun {
  if (
    !object(input) ||
    !validId(input.id) ||
    !integer(input.seed, 4294967295) ||
    input.seed === 0 ||
    !preparationId(input.preparation) ||
    !nodeId(input.nodeIndex) ||
    !["invite", "playing", "tea", "route", "between", "retry", "home"].includes(
      input.stage as string,
    ) ||
    (input.outcome !== null && !outcome(input.outcome)) ||
    !integer(input.whiteMoves, 3) ||
    (input.retriesUsed !== 0 && input.retriesUsed !== 1) ||
    !Array.isArray(input.route) ||
    ![1, 3].includes(input.route.length) ||
    input.route[0] !== 0 ||
    !input.route.every(nodeId) ||
    new Set(input.route).size !== input.route.length ||
    !Array.isArray(input.completedNodeIds) ||
    input.completedNodeIds.length > 3 ||
    !input.completedNodeIds.every(nodeId) ||
    new Set(input.completedNodeIds).size !== input.completedNodeIds.length
  )
    return fail();
  const run: JourneyRun = {
    id: input.id,
    seed: input.seed,
    preparation: input.preparation,
    stage: input.stage as JourneyStage,
    route: [...input.route],
    nodeIndex: input.nodeIndex,
    completedNodeIds: [...input.completedNodeIds],
    game: null,
    remainingHand: decodeCards(input.remainingHand, input.preparation),
    nodeEntryHand: decodeCards(input.nodeEntryHand, input.preparation),
    whiteMoves: input.whiteMoves,
    retriesUsed: input.retriesUsed,
    outcome: input.outcome as JourneyOutcome | null,
    facts: decodeFacts(input.facts),
  };
  if (
    (run.stage === "home") !== (run.outcome !== null) ||
    !run.route.includes(run.nodeIndex) ||
    !run.completedNodeIds.every((id, index) => run.route[index] === id) ||
    run.facts[0]?.type !== "prepared" ||
    run.facts[0].preparation !== run.preparation ||
    (run.outcome === "complete" && run.completedNodeIds.length !== 3) ||
    (run.outcome === "failed" && run.retriesUsed !== 1) ||
    (run.stage === "retry" && run.retriesUsed !== 0)
  )
    return fail();
  if (input.game !== null) {
    if (!validateSavedGame(input.game)) return fail();
    const clean = cleanGame(input.game);
    // History records the spell but not the identity of identical cards.
    // Try the at-most-six identity permutations instead of rejecting a player
    // who used the second copy first. The complete replay must still match.
    const replay = (position: GameState, index: number): boolean => {
      if (index === clean.history.length) {
        try {
          const final =
            clean.result?.reason === "resign"
              ? applyAction(position, { type: "resign" })
              : position;
          return same(cleanGame(final), clean);
        } catch {
          return false;
        }
      }
      const h = clean.history[index];
      if (h.color !== position.turn || h.ply !== position.ply) return false;
      try {
        if (h.type === "move") {
          if (h.from === undefined || h.to === undefined) return false;
          return replay(
            applyAction(position, {
              type: "move",
              move: { from: h.from, to: h.to },
            }),
            index + 1,
          );
        }
        if (h.from === undefined) return false;
        return position.hands[position.turn]
          .filter((card) => card.spell === h.spell)
          .some((card) => {
            try {
              return replay(
                applyAction(position, {
                  type: "cast",
                  cast: {
                    cardId: card.id,
                    targets: h.to === undefined ? [h.from!] : [h.from!, h.to],
                  },
                }),
                index + 1,
              );
            } catch {
              return false;
            }
          });
      } catch {
        return false;
      }
    };
    if (!replay(createNodeGame(run.nodeIndex, run.nodeEntryHand, run.seed), 0))
      return fail();
    run.game = clean;
    if (
      !same(run.remainingHand, clean.hands.white) ||
      run.whiteMoves !==
        clean.history.filter((h) => h.type === "move" && h.color === "white")
          .length
    )
      return fail();
  } else if (
    !(
      run.stage === "invite" ||
      (run.stage === "home" && run.outcome === "abandoned")
    ) ||
    run.whiteMoves !== 0
  )
    return fail();
  if (run.stage === "playing" && (!run.game || run.game.result)) return fail();
  if (
    ["tea", "route"].includes(run.stage) &&
    (run.nodeIndex !== 0 || run.completedNodeIds.length !== 1)
  )
    return fail();
  if (run.stage === "between" && run.completedNodeIds.length !== 2)
    return fail();
  if (
    (["tea", "route", "between"].includes(run.stage) ||
      run.outcome === "complete") &&
    (run.game?.result?.reason !== "checkmate" ||
      run.game.result.winner !== "white")
  )
    return fail();
  return run;
}

export function decodeJourneyProgress(input: unknown): JourneyProgress {
  if (
    !object(input) ||
    input.schema !== 1 ||
    !integer(input.revision) ||
    !Array.isArray(input.memories) ||
    input.memories.length > 18 ||
    !Array.isArray(input.appliedCommandIds) ||
    input.appliedCommandIds.length > 512 ||
    !input.appliedCommandIds.every(validId) ||
    new Set(input.appliedCommandIds).size !== input.appliedCommandIds.length
  )
    return fail();
  const decodeMemory = (x: unknown): JourneyMemory => {
    if (
      !object(x) ||
      !validId(x.runId) ||
      !outcome(x.outcome) ||
      !keepsake(x.keepsake)
    )
      return fail();
    const facts = decodeFacts(x.facts),
      last = facts.at(-1);
    if (
      last?.type !== "home" ||
      last.outcome !== x.outcome ||
      last.keepsake !== x.keepsake
    )
      return fail();
    const memory = {
      id: String(x.id),
      runId: x.runId,
      outcome: x.outcome,
      keepsake: x.keepsake,
      facts,
    };
    if (memory.id !== memoryId(memory)) return fail();
    return memory;
  };
  const memories = input.memories.map(decodeMemory);
  const lastMemory =
    input.lastMemory == null ? null : decodeMemory(input.lastMemory);
  if (new Set(memories.map((m) => m.id)).size !== memories.length)
    return fail();
  const activeRun =
    input.activeRun === null ? null : decodeRun(input.activeRun);
  const saved =
    activeRun && lastMemory?.runId === activeRun.id ? lastMemory : null;
  if (
    saved &&
    activeRun &&
    (activeRun.stage !== "home" ||
      !same(saved.facts, activeRun.facts) ||
      saved.outcome !== activeRun.outcome)
  )
    return fail();
  return {
    schema: 1,
    revision: input.revision,
    activeRun,
    memories,
    lastMemory,
    appliedCommandIds: [...input.appliedCommandIds],
  };
}

export const cleanJourney = (progress: JourneyProgress): JourneyProgress =>
  decodeJourneyProgress(progress);

function enterNode(run: JourneyRun, id: JourneyNodeId) {
  run.nodeIndex = id;
  run.nodeEntryHand = cards(run.remainingHand);
  run.game = createNodeGame(id, run.nodeEntryHand, run.seed);
  run.whiteMoves = 0;
  run.stage = "playing";
}
function settle(
  run: JourneyRun,
  won: boolean,
  reason: Extract<JourneyFact, { type: "node" }>["reason"],
) {
  run.facts.push({
    type: "node",
    nodeId: run.nodeIndex,
    result: won ? "won" : "lost",
    reason,
  });
  if (!won) {
    if (run.retriesUsed === 0) run.stage = "retry";
    else {
      run.stage = "home";
      run.outcome = "failed";
    }
    return;
  }
  run.completedNodeIds.push(run.nodeIndex);
  if (run.completedNodeIds.length === 3) {
    run.stage = "home";
    run.outcome = "complete";
  } else run.stage = run.nodeIndex === 0 ? "tea" : "between";
}

export function reduceJourney(
  progress: JourneyProgress,
  command: JourneyCommand,
): JourneyProgress {
  if (!validId(command.commandId)) throw new Error("棋旅命令标识无效");
  if (progress.appliedCommandIds.includes(command.commandId)) return progress;
  if (
    command.type === "finishHome" &&
    progress.activeRun?.facts.at(-1)?.type === "home"
  )
    return progress;
  if (command.type === "start" && progress.activeRun?.id === command.runId)
    return progress;
  const next = clone(progress),
    run = next.activeRun;
  const requireStage = (...stages: JourneyStage[]) => {
    if (!run || !stages.includes(run.stage))
      throw new Error("当前棋旅阶段不能执行这个操作");
    return run;
  };
  switch (command.type) {
    case "start": {
      if (
        !validId(command.runId) ||
        !integer(command.seed, 4294967295) ||
        command.seed === 0 ||
        !preparationId(command.preparation)
      )
        throw new Error("棋旅准备无效");
      if (
        next.memories.some((m) => m.runId === command.runId) ||
        next.lastMemory?.runId === command.runId
      )
        throw new Error("棋旅身份已使用");
      if (run && (run.stage !== "home" || run.facts.at(-1)?.type !== "home"))
        throw new Error("请先完成这一晚的归家相处");
      const hand = preparationCards(command.preparation);
      next.activeRun = {
        id: command.runId,
        seed: command.seed,
        preparation: command.preparation,
        stage: "invite",
        route: [0],
        nodeIndex: 0,
        completedNodeIds: [],
        game: null,
        remainingHand: hand,
        nodeEntryHand: cards(hand),
        whiteMoves: 0,
        retriesUsed: 0,
        outcome: null,
        facts: [{ type: "prepared", preparation: command.preparation }],
      };
      break;
    }
    case "acceptInvitation": {
      const r = requireStage("invite");
      r.facts.push({ type: "invitation" });
      enterNode(r, 0);
      break;
    }
    case "play": {
      const r = requireStage("playing"),
        game = r.game!;
      if (game.version !== command.expectedGameVersion)
        throw new Error("棋旅棋局已更新，请重新确认");
      const after = applyAction(game, command.action);
      for (const h of after.history.slice(game.history.length)) {
        if (h.type === "move")
          r.facts.push({
            type: "move",
            nodeId: r.nodeIndex,
            ply: h.ply,
            color: h.color,
            from: h.from!,
            to: h.to!,
            ...(h.captured ? { captured: h.captured } : {}),
          });
        else if (command.action.type === "cast")
          r.facts.push({
            type: "cast",
            nodeId: r.nodeIndex,
            ply: h.ply,
            color: h.color,
            spell: h.spell!,
            targets: [...command.action.cast.targets],
          });
      }
      if (command.action.type === "move" && game.turn === "white")
        r.whiteMoves++;
      r.game = after;
      r.remainingHand = cards(after.hands.white);
      if (after.result)
        settle(
          r,
          after.result.winner === "white" &&
            after.result.reason === "checkmate",
          after.result.reason,
        );
      else if (
        command.action.type === "move" &&
        game.turn === "black" &&
        r.whiteMoves >= JOURNEY_NODES[r.nodeIndex].whiteMoveLimit
      )
        settle(r, false, "limit");
      break;
    }
    case "help": {
      const r = requireStage("playing");
      if (!["threat", "reason", "demo"].includes(command.level))
        throw new Error("未知帮助层级");
      if (
        !r.facts.some(
          (f) =>
            f.type === "help" &&
            f.nodeId === r.nodeIndex &&
            f.level === command.level,
        )
      )
        r.facts.push({
          type: "help",
          nodeId: r.nodeIndex,
          level: command.level,
        });
      break;
    }
    case "retry": {
      const r = requireStage("retry");
      if (r.retriesUsed !== 0) throw new Error("本程重试已经用过");
      r.retriesUsed = 1;
      r.remainingHand = cards(r.nodeEntryHand);
      r.game = createNodeGame(r.nodeIndex, r.nodeEntryHand, r.seed);
      r.whiteMoves = 0;
      r.stage = "playing";
      r.facts.push({ type: "retry", nodeId: r.nodeIndex });
      break;
    }
    case "tea": {
      const r = requireStage("tea");
      if (command.choice !== "offer" && command.choice !== "receive")
        throw new Error("未知茶桌选择");
      r.facts.push({ type: "tea", choice: command.choice });
      r.stage = "route";
      break;
    }
    case "route": {
      const r = requireStage("route");
      if (command.firstNode !== 1 && command.firstNode !== 2)
        throw new Error("未知路线");
      r.route = [0, command.firstNode, command.firstNode === 1 ? 2 : 1];
      r.facts.push({ type: "route", firstNode: command.firstNode });
      enterNode(r, command.firstNode);
      break;
    }
    case "advance": {
      const r = requireStage("between");
      enterNode(r, r.route[r.completedNodeIds.length]);
      break;
    }
    case "abandon": {
      const r = requireStage(
        "invite",
        "playing",
        "tea",
        "route",
        "between",
        "retry",
      );
      r.facts.push({ type: "abandon", nodeId: r.nodeIndex });
      r.stage = "home";
      r.outcome = "abandoned";
      break;
    }
    case "finishHome": {
      const r = requireStage("home");
      if (!keepsake(command.keepsake)) throw new Error("未知纪念物");
      r.facts.push({
        type: "home",
        outcome: r.outcome!,
        keepsake: command.keepsake,
      });
      const memory: JourneyMemory = {
        id: "",
        runId: r.id,
        outcome: r.outcome!,
        keepsake: command.keepsake,
        facts: clone(r.facts),
      };
      memory.id = memoryId(memory);
      // Keep every first-earned pattern and its provenance. The latest evening
      // is separate, so replay never grows an unbounded inventory or erases it.
      if (!next.memories.some((m) => m.id === memory.id))
        next.memories.push(memory);
      next.lastMemory = memory;
      break;
    }
    default:
      throw new Error("未知棋旅命令");
  }
  if (next.activeRun && next.activeRun.facts.length > 256)
    throw new Error("这一晚的记录已满，请归家保存");
  next.revision++;
  next.appliedCommandIds = [...next.appliedCommandIds, command.commandId].slice(
    -512,
  );
  return next;
}

export function mergeJourneyProgress(
  local: JourneyProgress,
  incoming: JourneyProgress,
): JourneyProgress {
  const a = cleanJourney(local),
    b = cleanJourney(incoming);
  // Cloud merge adds completed keepsakes but never rewinds a local active board.
  const ids = new Set(a.memories.map((m) => m.id));
  const memories = [...a.memories, ...b.memories.filter((m) => !ids.has(m.id))];
  if (memories.length > 18) throw new Error("棋旅纪念记录无效，未覆盖任何记录");
  const activeRun = a.activeRun ?? b.activeRun;
  const compatibleMemory = (m: JourneyMemory) =>
    !activeRun ||
    m.runId !== activeRun.id ||
    (activeRun.facts.at(-1)?.type === "home" && same(m.facts, activeRun.facts));
  const lastMemory =
    [a.lastMemory, b.lastMemory].find((m) => m && compatibleMemory(m)) ?? null;
  return cleanJourney({
    schema: 1,
    revision: Math.max(a.revision, b.revision),
    activeRun,
    memories: memories.filter(compatibleMemory),
    lastMemory,
    appliedCommandIds: [
      ...new Set([...b.appliedCommandIds, ...a.appliedCommandIds]),
    ].slice(-512),
  });
}
