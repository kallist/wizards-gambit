import { describe, expect, it } from "vitest";
import {
  applyAction,
  canCast,
  clone,
  createGame,
  evaluateResult,
  fromFEN,
  inCheck,
  legalMoves,
  possibleCasts,
  previewMove,
} from "../src/domain/engine";
import { SPELLS } from "../src/domain/spells";
import { square } from "../src/domain/types";
import type { GameState, SpellId } from "../src/domain/types";

function move(
  s: GameState,
  from: string,
  to: string,
  promotion?: "q" | "r" | "b" | "n",
) {
  return applyAction(s, {
    type: "move",
    move: { from: square(from), to: square(to), promotion },
  });
}
function give(s: GameState, spell: SpellId) {
  s.hands[s.turn] = [{ id: "test-card", spell, readyPly: 0 }];
  return s;
}
function cast(s: GameState, ...targets: string[]) {
  return applyAction(s, {
    type: "cast",
    cast: { cardId: "test-card", targets: targets.map(square) },
  });
}
function perft(s: GameState, depth: number): number {
  if (!depth) return 1;
  return legalMoves(s).reduce((total, m) => {
    const n = previewMove(s, m);
    n.turn = s.turn === "white" ? "black" : "white";
    n.ply++;
    return total + perft(n, depth - 1);
  }, 0);
}

describe("标准棋规则", () => {
  it("初始局面逐层走法计数为 20 / 400 / 8902", () => {
    const s = createGame("classic", 1);
    expect(perft(s, 1)).toBe(20);
    expect(perft(s, 2)).toBe(400);
    expect(perft(s, 3)).toBe(8902);
  });
  it("王车易位、吃过路兵综合局面的计数为 48 / 2039", () => {
    const s = fromFEN(
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    );
    expect(perft(s, 1)).toBe(48);
    expect(perft(s, 2)).toBe(2039);
  });
  it("允许两侧王车易位并正确移动城堡", () => {
    const s = fromFEN("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(legalMoves(s, square("e1")).filter((m) => m.castle)).toHaveLength(2);
    const n = move(s, "e1", "g1");
    expect(n.board[square("f1")]?.kind).toBe("r");
    expect(n.board[square("h1")]).toBeNull();
  });
  it("禁止穿越受攻击格易位", () => {
    const s = fromFEN("4kr2/8/8/8/8/8/8/4K2R w K - 0 1");
    expect(legalMoves(s, square("e1")).some((m) => m.castle)).toBe(false);
  });
  it("吃过路兵移除正确的实体", () => {
    const s = fromFEN("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2");
    const n = move(s, "e5", "d6");
    expect(n.board[square("d5")]).toBeNull();
    expect(n.board[square("d6")]?.color).toBe("white");
  });
  it("吃过路兵不能暴露国王", () => {
    const s = fromFEN("4k3/8/8/r4pPK/8/8/8/8 w - f6 0 1");
    expect(legalMoves(s, square("g5")).some((m) => m.enPassant)).toBe(false);
  });
  it("提供四种升变", () => {
    const s = fromFEN("7k/P7/8/8/8/8/8/7K w - - 0 1");
    expect(
      legalMoves(s, square("a7"))
        .map((m) => m.promotion)
        .sort(),
    ).toEqual(["b", "n", "q", "r"]);
    expect(move(s, "a7", "a8", "n").board[square("a8")]?.kind).toBe("n");
  });
  it("将死不实际吃掉国王", () => {
    let s = createGame("classic");
    s = move(s, "f2", "f3");
    s = move(s, "e7", "e5");
    s = move(s, "g2", "g4");
    s = move(s, "d8", "h4");
    expect(s.result).toEqual({ winner: "black", reason: "checkmate" });
    expect(s.board.filter((p) => p?.kind === "k")).toHaveLength(2);
  });
  it("区分逼和", () =>
    expect(evaluateResult(fromFEN("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"))).toEqual({
      winner: null,
      reason: "stalemate",
    }));
  it("三次重复局面计入标准相同局面", () => {
    let s = createGame("classic");
    for (let i = 0; i < 2; i++) {
      s = move(s, "g1", "f3");
      s = move(s, "g8", "f6");
      s = move(s, "f3", "g1");
      s = move(s, "f6", "g8");
    }
    expect(s.result?.reason).toBe("repetition");
  });
  it("不接受非法棋步且输入状态保持不变", () => {
    const s = createGame("classic"),
      before = clone(s);
    expect(() => move(s, "e2", "e5")).toThrow();
    expect(s).toEqual(before);
  });
});

describe("魔法规则与补牌", () => {
  it("24种不同技能，开局三张无重复且可复现", () => {
    expect(new Set(SPELLS.map((s) => s.id)).size).toBe(24);
    const a = createGame("magic", 42),
      b = createGame("magic", 42);
    expect(a).toEqual(b);
    expect(a.hands.white).toHaveLength(3);
    expect(new Set(a.hands.white.map((c) => c.spell)).size).toBe(3);
  });
  it("经典棋没有手牌且不能施法", () =>
    expect(possibleCasts(createGame("classic"))).toEqual([]));
  it("兵击毁不补牌，高阶子击毁补牌并且满手必须取舍", () => {
    const s = fromFEN("4k3/8/8/3r4/3R4/8/8/4K3 w - - 0 1", "magic", 1);
    const n = move(s, "d4", "d5");
    expect(n.hands.white).toHaveLength(4);
    expect(n.phase).toBe("discard");
    expect(n.turn).toBe("white");
    const last = n.hands.white.at(-1)!;
    expect(last.readyPly).toBe(2);
    const done = applyAction(n, {
      type: "discard",
      cardId: n.hands.white[0].id,
    });
    expect(done.hands.white).toHaveLength(3);
    expect(done.turn).toBe("black");
    const pawn = fromFEN("4k3/8/8/3p4/3R4/8/8/4K3 w - - 0 1", "magic", 1);
    expect(move(pawn, "d4", "d5").hands.white).toHaveLength(3);
  });
  it("同一实体不能重复获得补牌奖励", () => {
    const s = fromFEN("4k3/8/8/3r4/3R4/8/8/4K3 w - - 0 1", "magic", 1);
    s.rewarded.push(s.board[square("d5")]!.id);
    expect(move(s, "d4", "d5").hands.white).toHaveLength(3);
  });
  it("技能使用后消耗、进入走棋阶段、不能一回合施法两次", () => {
    const s = give(createGame("magic", 1), "protego"),
      n = cast(s, "e2");
    expect(n.phase).toBe("move");
    expect(n.hands.white).toHaveLength(0);
    expect(n.turn).toBe("white");
    expect(() => cast(n, "d2")).toThrow();
  });
  it("非法技能目标不消耗手牌、不修改原状态", () => {
    const s = give(createGame("magic"), "protego"),
      before = clone(s);
    expect(() => cast(s, "e1")).toThrow();
    expect(s).toEqual(before);
  });
  it("魔法解将计入将死判断", () => {
    const s = give(
      fromFEN("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1", "magic", 1),
      "colloportus",
    );
    // 该局面是真正贴身将死，屏障不能覆盖占用的g7，不能伪造解围。
    expect(evaluateResult(s)?.reason).toBe("checkmate");
    const rescue = give(
      fromFEN("4r1k1/8/8/8/8/8/3P1P2/3RKR2 w - - 0 1", "magic", 2),
      "colloportus",
    );
    expect(inCheck(rescue)).toBe(true);
    expect(
      canCast(rescue, { cardId: "test-card", targets: [square("e3")] }),
    ).toBe(true);
  });
  it("保护失效会暴露本方国王的棋步不合法", () => {
    const s = give(
      fromFEN("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1", "magic", 2),
      "protego",
    );
    s.tiles.push({
      square: square("e3"),
      type: "wall",
      until: 1,
      owner: "white",
    });
    expect(legalMoves(s).every((m) => m.from === square("e1"))).toBe(true);
  });
  it("羽加迪姆勒维奥萨可以越过一个棋子", () => {
    const s = give(
      fromFEN("7k/8/8/8/8/8/P7/R6K w - - 0 1", "magic"),
      "leviosa",
    );
    const n = cast(s, "a1");
    expect(legalMoves(n, square("a1")).some((m) => m.to === square("a3"))).toBe(
      true,
    );
  });
  it("飞来咒位移后仍须正常走棋", () => {
    const s = give(fromFEN("7k/8/8/8/3N4/8/8/4K3 w - - 0 1", "magic"), "accio");
    const n = cast(s, "d4", "d2");
    expect(n.board[square("d2")]?.kind).toBe("n");
    expect(n.ply).toBe(0);
    expect(n.phase).toBe("move");
  });
  it("石化取消攻击，效果在对方回合结束时失效", () => {
    const s = give(
      fromFEN("7k/8/8/3n4/8/8/8/R6K w - - 0 1", "magic"),
      "petrificus",
    );
    const n = cast(s, "d5");
    expect(n.board[square("d5")]!.effects[0].type).toBe("frozen");
    const a = move(n, "a1", "a2"),
      b = move(a, "h8", "g8");
    expect(b.board[square("d5")]!.effects).toEqual([]);
  });
  it("护盾抵挡定向魔法，并消耗施法方的牌", () => {
    const s = give(
      fromFEN("7k/8/8/3n4/8/8/8/R6K w - - 0 1", "magic"),
      "petrificus",
    );
    s.board[square("d5")]!.effects.push({
      type: "ward",
      until: 10,
      source: "black",
    });
    const n = cast(s, "d5");
    expect(n.board[square("d5")]!.effects).toEqual([]);
    expect(n.hands.white).toHaveLength(0);
  });
  it("火印阻止落点但不阻挡长程射线", () => {
    const s = give(
        fromFEN("7k/8/8/8/8/8/8/R6K w - - 0 1", "magic"),
        "incendio",
      ),
      n = cast(s, "a4");
    const moves = legalMoves(n, square("a1"));
    expect(moves.some((m) => m.to === square("a4"))).toBe(false);
    expect(moves.some((m) => m.to === square("a5"))).toBe(true);
  });
  it("荧光闪烁只揭示一张牌，不改变敌方手牌", () => {
    const s = give(createGame("magic", 5), "lumos"),
      n = cast(s);
    expect(n.revealed.black).toHaveLength(1);
    expect(n.hands.black).toEqual(s.hands.black);
  });
  it("一忘皆空保持三牌上限", () => {
    const s = give(createGame("magic", 5), "obliviate"),
      n = cast(s);
    expect(n.hands.black).toHaveLength(3);
    expect(
      n.hands.black.filter(
        (c) => !s.hands.black.some((old) => old.id === c.id),
      ),
    ).toHaveLength(1);
  });
  it("取舍前不能偷走第二步", () => {
    const s = move(
      fromFEN("4k3/8/8/3r4/3R4/8/8/4K3 w - - 0 1", "magic"),
      "d4",
      "d5",
    );
    expect(() => move(s, "d5", "d6")).toThrow();
  });
});
