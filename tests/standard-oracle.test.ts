import { Chess } from "chess.js";
import { expect, it } from "vitest";
import {
  applyAction,
  createGame,
  fromFEN,
  legalMoves,
  positionKey,
  validateSavedGame,
} from "../src/domain/engine";
import { squareName, type GameState } from "../src/domain/types";

// This exhaustive correctness check performs up to 960 independent comparisons.
// It has no latency SLO; keep every position/assertion with a bounded budget on
// slower Windows hosts. Other unit tests retain the default 20-second timeout.
it("12 盘可复现的标准棋对局逐步对照独立棋规库（最多 960 个局面）", () => {
  let checked = 0,
    seed = 0x12345678;
  for (let game = 0; game < 12; game++) {
    const oracle = new Chess();
    let state = createGame("classic", game + 1);
    for (let ply = 0; ply < 80 && !state.result; ply++) {
      const ours = legalMoves(state),
        theirs = oracle.moves({ verbose: true });
      const label = (from: string, to: string, promotion?: string) =>
        from + to + (promotion ?? "");
      expect(
        ours
          .map((m) => label(squareName(m.from), squareName(m.to), m.promotion))
          .sort(),
        oracle.fen(),
      ).toEqual(theirs.map((m) => label(m.from, m.to, m.promotion)).sort());
      expect(validateSavedGame(state)).toBe(true);
      if (!ours.length) break;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const m = ours[(seed >>> 0) % ours.length];
      oracle.move({
        from: squareName(m.from),
        to: squareName(m.to),
        ...(m.promotion ? { promotion: m.promotion } : {}),
      });
      state = applyAction(state, { type: "move", move: m });
      checked++;
      const reconstructed = fromFEN(oracle.fen());
      expect(state.board.map((p) => (p ? p.color + p.kind : ""))).toEqual(
        reconstructed.board.map((p) => (p ? p.color + p.kind : "")),
      );
    }
  }
  expect(checked).toBeGreaterThan(700);
}, 60000);

it("易位权已经消失时，城堡移动标记不影响重复局面", () => {
  const a = fromFEN("7k/8/8/8/8/8/8/R3K3 w - - 0 1");
  const b = structuredClone(a);
  b.board[56]!.moved = false;
  expect(positionKey(a)).toBe(positionKey(b));
  const c = fromFEN("7k/8/8/8/8/8/8/R3K3 w Q - 0 1");
  expect(positionKey(a)).not.toBe(positionKey(c));
});

it("持久化边界拒绝损坏的嵌套字段而不抛出异常", () => {
  const changes: ((s: GameState) => void)[] = [
    (s) => {
      (s.board[0] as any).kind = null;
    },
    (s) => {
      s.history = [null as any];
    },
    (s) => {
      s.grave = [{ piece: null, square: 0 } as any];
    },
    (s) => {
      s.hands.white = [null as any];
    },
    (s) => {
      s.revealed.white = ["missing-card"];
    },
    (s) => {
      s.tiles = [{ square: 64, type: "wall", until: 2, owner: "white" }];
    },
    (s) => {
      s.ep = { square: 20, pawnSquare: 28, pawnId: "missing-pawn" };
    },
    (s) => {
      s.result = { winner: "white", reason: "resign" };
    },
    (s) => {
      s.board[1]!.effects = [null as any];
    },
    (s) => {
      s.repetitions = { bad: -1 };
    },
    (s) => {
      s.rng = NaN;
    },
    (s) => {
      s.board[1]!.id = s.board[0]!.id;
    },
  ];
  for (const change of changes) {
    const s = createGame("magic", 1);
    change(s);
    expect(() => validateSavedGame(s)).not.toThrow();
    expect(validateSavedGame(s)).toBe(false);
  }
  expect(validateSavedGame(null)).toBe(false);
  expect(validateSavedGame({})).toBe(false);
});
