import {
  clone,
  inCheck,
  legalMoves,
  possibleCasts,
  previewCast,
  previewMove,
} from "../domain/engine";
import { file, other, row, values } from "../domain/types";
import type { Action, Color, GameState, Move } from "../domain/types";

export type Difficulty = "gentle" | "normal" | "clever";
const budgets: Record<Difficulty, number> = {
  gentle: 180,
  normal: 480,
  clever: 1000,
};

export function aiView(source: GameState): GameState {
  const state = clone(source),
    enemy = other(source.turn);
  state.hands[enemy] = state.hands[enemy].map((card) => ({
    ...card,
    spell: state.revealed[enemy].includes(card.id) ? card.spell : "protego",
  }));
  state.rng = 910247;
  state.repetitions = {};
  return state;
}

function evaluation(s: GameState, color: Color): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p) continue;
    const center = 7 - Math.abs(file(i) - 3.5) - Math.abs(row(i) - 3.5);
    const advance = p.color === "white" ? 6 - row(i) : row(i) - 1;
    let value =
      values[p.kind] +
      (p.kind === "p"
        ? advance * 12
        : p.kind === "k"
          ? -center * 3
          : center * 5);
    if (p.effects.some((e) => e.type === "frozen"))
      value -= Math.min(value * 0.25, 90);
    if (p.effects.some((e) => e.type === "ward" || e.type === "veil"))
      value += 18;
    if (p.effects.some((e) => e.type === "slow" || e.type === "diagonal"))
      value -= 25;
    score += p.color === color ? value : -value;
  }
  if (inCheck(s, other(color))) score += 45;
  if (inCheck(s, color)) score -= 70;
  return score;
}

function after(s: GameState, move: Move): GameState {
  const n = previewMove(s, move);
  n.turn = other(s.turn);
  n.ply++;
  n.phase = "play";
  n.result = null;
  return n;
}

export function chooseAction(
  source: GameState,
  difficulty: Difficulty = "normal",
  deterministic = false,
): Action | null {
  const state = aiView(source),
    color = state.turn,
    deadline = deterministic
      ? Infinity
      : performance.now() + budgets[difficulty];
  if (state.phase === "discard") {
    const card =
      state.hands[color].find((c) =>
        ["lumos", "obliviate", "reparo"].includes(c.spell),
      ) ?? state.hands[color].at(-1);
    return card ? { type: "discard", cardId: card.id } : null;
  }
  if (state.result) return null;
  type Candidate = { action: Action; position: GameState; score: number };
  const candidates: Candidate[] = [];
  const consider = (position: GameState, action: Action, cost = 0) => {
    for (const m of legalMoves(position)) {
      const n = after(position, m);
      let score = evaluation(n, color) - cost;
      if (inCheck(n) && !legalMoves(n).length)
        score += n.hands[n.turn].length ? 1000 : 100000;
      candidates.push({
        action: action.type === "cast" ? action : { type: "move", move: m },
        position: n,
        score,
      });
    }
  };
  consider(state, { type: "move", move: { from: 0, to: 0 } });
  if (state.phase === "play" && performance.now() < deadline) {
    for (const cast of possibleCasts(
      state,
      undefined,
      difficulty === "gentle" ? 5 : 18,
    )) {
      if (performance.now() > deadline) break;
      consider(previewCast(state, cast), { type: "cast", cast }, 22);
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  if (difficulty === "gentle")
    return candidates[Math.min(candidates.length - 1, source.ply % 3)].action;
  const shortlist = candidates.slice(0, difficulty === "clever" ? 8 : 4);
  for (const c of shortlist) {
    if (performance.now() > deadline) break;
    let replyBest = -Infinity;
    for (const reply of legalMoves(c.position)) {
      const n = after(c.position, reply);
      replyBest = Math.max(replyBest, -evaluation(n, color));
      if (performance.now() > deadline) break;
    }
    if (Number.isFinite(replyBest)) c.score = -replyBest;
    if (difficulty === "clever" && performance.now() < deadline) {
      for (const cast of possibleCasts(c.position, undefined, 2)) {
        for (const reply of legalMoves(previewCast(c.position, cast)).slice(
          0,
          6,
        )) {
          c.score = Math.min(
            c.score,
            evaluation(after(previewCast(c.position, cast), reply), color),
          );
          if (performance.now() > deadline) break;
        }
      }
    }
  }
  return shortlist.sort((a, b) => b.score - a.score)[0].action;
}
