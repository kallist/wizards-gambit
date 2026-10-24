import { describe, expect, it } from "vitest";
import {
  applyAction,
  attacksFrom,
  clone,
  fromFEN,
  legalMoves,
  validateSavedGame,
} from "../src/domain/engine";
import { SPELLS } from "../src/domain/spells";
import { square, type GameState, type SpellId } from "../src/domain/types";
import { rulesForViewer, validSnapshot } from "../src/platform/room";
import { publicGame } from "../server/index";

const fixture = () =>
  fromFEN("7k/4q3/5nbr/2p5/3RP3/3B1N2/1PP5/K7 w - - 0 1", "magic", 91);
const get = (s: GameState, at: string) => s.board[square(at)]!;
const destinations = (s: GameState, at: string) =>
  legalMoves(s, square(at)).map((m) => m.to);
const negative = (s: GameState) => {
  get(s, "f3").effects = [
    { type: "frozen", until: 2, source: "black" },
    { type: "slow", until: 2, source: "black" },
  ];
};
const terrain = (s: GameState) => {
  s.tiles = [{ square: square("d5"), type: "wall", until: 2, owner: "black" }];
};
type Case = {
  spell: SpellId;
  targets: string[];
  prepare?: (s: GameState) => void;
  prove: (s: GameState, before: GameState) => void;
};
const cases: Case[] = [
  {
    spell: "leviosa",
    targets: ["d4"],
    prove: (s) => expect(destinations(s, "d4")).toContain(square("f4")),
  },
  {
    spell: "accio",
    targets: ["f3", "e2"],
    prove: (s) => {
      expect(get(s, "e2").kind).toBe("n");
      expect(s.board[square("f3")]).toBeNull();
    },
  },
  {
    spell: "glisseo",
    targets: ["e4"],
    prove: (s) => expect(destinations(s, "e4")).toContain(square("f4")),
  },
  {
    spell: "waddiwasi",
    targets: ["e4"],
    prove: (s) => {
      expect(get(s, "e5").kind).toBe("p");
      expect(s.board[square("e4")]).toBeNull();
    },
  },
  {
    spell: "protego",
    targets: ["d4"],
    prove: (s) =>
      expect(get(s, "d4").effects.map((e) => e.type)).toContain("ward"),
  },
  {
    spell: "patronum",
    targets: ["b2"],
    prove: (s) => {
      expect(get(s, "b2").effects[0].type).toBe("ward");
      expect(get(s, "c2").effects[0].type).toBe("ward");
    },
  },
  {
    spell: "finite",
    targets: ["f3"],
    prepare: negative,
    prove: (s) => expect(get(s, "f3").effects).toEqual([]),
  },
  {
    spell: "reparo",
    targets: ["a2"],
    prepare: (s) => {
      const p = clone(get(s, "b2"));
      p.id = "white-48";
      s.grave = [{ piece: p, square: square("a4") }];
    },
    prove: (s) => {
      expect(get(s, "a2").id).toBe("white-48");
      expect(get(s, "a2").moved).toBe(true);
      expect(s.grave).toHaveLength(0);
    },
  },
  {
    spell: "petrificus",
    targets: ["f6"],
    prove: (s) => expect(attacksFrom(s, square("f6"))).toEqual([]),
  },
  {
    spell: "impedimenta",
    targets: ["h6"],
    prove: (s) => {
      expect(attacksFrom(s, square("h6"))).toContain(square("h4"));
      expect(attacksFrom(s, square("h6"))).not.toContain(square("h3"));
    },
  },
  {
    spell: "stupefy",
    targets: ["c5"],
    prove: (s) => expect(attacksFrom(s, square("c5"))).toEqual([]),
  },
  {
    spell: "tarantallegra",
    targets: ["e7"],
    prove: (s) => {
      expect(attacksFrom(s, square("e7"))).toContain(square("d6"));
      expect(attacksFrom(s, square("e7"))).not.toContain(square("e6"));
    },
  },
  {
    spell: "incendio",
    targets: ["g4"],
    prove: (s) => {
      expect(s.tiles[0].type).toBe("fire");
      expect(destinations(s, "d4")).not.toContain(square("g4"));
    },
  },
  {
    spell: "aguamenti",
    targets: ["d5"],
    prepare: terrain,
    prove: (s) => {
      expect(s.tiles[0].type).toBe("water");
      expect(destinations(s, "e4")).toContain(square("e3"));
    },
  },
  {
    spell: "colloportus",
    targets: ["a3"],
    prove: (s) =>
      expect(s.tiles[0]).toMatchObject({ type: "wall", square: square("a3") }),
  },
  {
    spell: "alohomora",
    targets: ["d5"],
    prepare: terrain,
    prove: (s) => {
      expect(s.tiles).toEqual([]);
      expect(destinations(s, "d4")).toContain(square("f4"));
    },
  },
  {
    spell: "expelliarmus",
    targets: ["f6", "f5"],
    prove: (s) => {
      expect(get(s, "f5").color).toBe("black");
      expect(s.board[square("f6")]).toBeNull();
    },
  },
  {
    spell: "diffindo",
    targets: ["f6"],
    prepare: (s) => {
      get(s, "f6").effects = [{ type: "ward", until: 2, source: "black" }];
    },
    prove: (s) => expect(get(s, "f6").effects).toEqual([]),
  },
  {
    spell: "engorgio",
    targets: ["e4"],
    prepare: (s) => {
      const p = clone(get(s, "c5"));
      p.id = "black-test-pawn";
      s.board[square("e5")] = p;
    },
    prove: (s) => expect(destinations(s, "e4")).toContain(square("e5")),
  },
  {
    spell: "reducio",
    targets: ["f3"],
    prove: (s) => expect(destinations(s, "f3")).toContain(square("f4")),
  },
  {
    spell: "lumos",
    targets: [],
    prove: (s, before) => {
      expect(s.revealed.black).toHaveLength(1);
      expect(s.hands.black).toEqual(before.hands.black);
    },
  },
  {
    spell: "nox",
    targets: ["f3"],
    prove: (s) =>
      expect(get(s, "f3").effects.map((e) => e.type)).toContain("veil"),
  },
  {
    spell: "obliviate",
    targets: [],
    prove: (s, before) => {
      expect(s.hands.black).toHaveLength(3);
      expect(
        s.hands.black.filter(
          (c) => !before.hands.black.some((old) => old.id === c.id),
        ),
      ).toHaveLength(1);
    },
  },
  {
    spell: "riddikulus",
    targets: ["f3"],
    prepare: negative,
    prove: (s) => {
      expect(get(s, "f3").effects.filter((e) => e.type === "frozen")).toEqual(
        [],
      );
      expect(get(s, "f3").effects.map((e) => e.type)).toEqual(["slow", "ward"]);
    },
  },
];
describe("24 个魔法的实际效果", () => {
  it("行为用例覆盖完整技能库", () =>
    expect(cases.map((c) => c.spell).sort()).toEqual(
      SPELLS.map((s) => s.id).sort(),
    ));
  for (const entry of cases)
    it(entry.spell, () => {
      const state = fixture();
      entry.prepare?.(state);
      state.hands.white = [{ id: "test", spell: entry.spell, readyPly: 0 }];
      const before = clone(state);
      const result = applyAction(state, {
        type: "cast",
        cast: { cardId: "test", targets: entry.targets.map(square) },
      });
      entry.prove(result, before);
      expect(result.hands.white).toHaveLength(0);
      expect(result.phase).toBe("move");
      expect(result.ply).toBe(0);
      expect(legalMoves(result).length).toBeGreaterThan(0);
      expect(state).toEqual(before);
      expect(validateSavedGame(result)).toBe(true);
    });
  it("诺克斯实际阻止对方定向施法", () => {
    const state = fixture();
    get(state, "f6").effects = [{ type: "veil", until: 2, source: "black" }];
    state.hands.white = [{ id: "test", spell: "petrificus", readyPly: 0 }];
    expect(() =>
      applyAction(state, {
        type: "cast",
        cast: { cardId: "test", targets: [square("f6")] },
      }),
    ).toThrow("诺克斯");
  });
  it("联网未知手牌仍可使用情报魔法，且临时视图不泄露或修改原状态", () => {
    const state = fixture(),
      original = clone(state);
    const snapshot = publicGame(state, "white");
    expect(validateSavedGame(snapshot.state, true)).toBe(true);
    expect(validateSavedGame(snapshot.state)).toBe(false);
    const view = rulesForViewer(
      snapshot.state,
      "white",
      snapshot.enemyHandCount,
    );
    expect(view.hands.black).toHaveLength(3);
    expect(snapshot.state.hands.black).toHaveLength(0);
    expect(view.hands.black.every((c) => c.id.startsWith("unknown-card"))).toBe(
      true,
    );
    expect(state).toEqual(original);
  });
  it("损坏的房间状态不能进入界面", () => {
    const p = publicGame(fixture(), "white");
    const x = {
      type: "state",
      room: {
        code: "ABC123",
        host: "white",
        rules: "magic",
        matchId: "a".repeat(32),
        players: [
          { color: "white", joined: true, online: true, ready: true },
          { color: "black", joined: true, online: true, ready: true },
        ],
        rematch: [],
      },
      playerColor: "white",
      ...p,
    };
    expect(validSnapshot(x)).toBe(true);
    expect(validSnapshot({ ...x, enemyHandCount: 5 })).toBe(false);
    expect(
      validSnapshot({ ...x, room: { ...x.room, players: [null, null] } }),
    ).toBe(false);
    expect(
      validSnapshot({ ...x, state: { ...x.state, history: [null] } }),
    ).toBe(false);
    expect(validSnapshot(null)).toBe(false);
  });
});
