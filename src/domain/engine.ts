import { SPELLS, spellById } from "./spells";
import {
  distance,
  file,
  other,
  pieceName,
  row,
  square,
  squareName,
} from "./types";
import type {
  Action,
  Card,
  Cast,
  Color,
  EffectType,
  GameState,
  Kind,
  Move,
  Piece,
  Result,
  RuleSet,
} from "./types";

const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const KNIGHT = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];
const NEGATIVE: EffectType[] = ["frozen", "slow", "noCapture", "diagonal"];
const POSITIVE: EffectType[] = [
  "ward",
  "veil",
  "jump",
  "slide",
  "large",
  "small",
];
const PROMOTIONS = ["q", "r", "b", "n"] as const;
export const clone = <T>(value: T): T => structuredClone(value);
export const activeEffect = (p: Piece, effect: EffectType) =>
  p.effects.some((e) => e.type === effect);
const validSquare = (s: number) => Number.isInteger(s) && s >= 0 && s < 64;
const step = (s: number, dx: number, dy: number) => {
  const x = file(s) + dx,
    y = row(s) + dy;
  return x >= 0 && x < 8 && y >= 0 && y < 8 ? y * 8 + x : -1;
};
const kingSquare = (s: GameState, c: Color) =>
  s.board.findIndex((p) => p?.color === c && p.kind === "k");
const isWall = (s: GameState, at: number) =>
  s.tiles.some((t) => t.square === at && t.type === "wall");
const blocked = (s: GameState, at: number) =>
  s.tiles.some(
    (t) => t.square === at && (t.type === "wall" || t.type === "fire"),
  );

function random(s: GameState): number {
  let n = s.rng >>> 0;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  s.rng = n >>> 0 || 0x9e3779b9;
  return s.rng / 4294967296;
}

function draw(s: GameState, color: Color, readyPly: number): Card | null {
  const held = new Set(s.hands[color].map((c) => c.spell));
  const pool = SPELLS.filter((c) => !held.has(c.id));
  if (!pool.length) return null;
  const spell = pool[Math.floor(random(s) * pool.length)].id;
  const card = { id: `card-${++s.cardSerial}`, spell, readyPly };
  s.hands[color].push(card);
  return card;
}

export function fromFEN(
  fen: string,
  rules: RuleSet = "classic",
  seed = 19790731,
): GameState {
  const [layout, active = "w", rights = "-", ep = "-", half = "0", full = "1"] =
    fen.split(" ");
  const board: (Piece | null)[] = [];
  for (const rank of layout.split("/")) {
    const start = board.length;
    for (const char of rank) {
      if (/^[1-8]$/.test(char)) board.push(...Array(Number(char)).fill(null));
      else {
        if (!/^[prnbqkPRNBQK]$/.test(char)) throw new Error("棋子编码无效");
        const kind = char.toLowerCase() as Kind,
          color = char === char.toUpperCase() ? "white" : "black";
        const at = board.length;
        board.push({
          id: `${color}-${at}`,
          color,
          kind,
          origin: kind,
          moved: kind !== "p" || row(at) !== (color === "white" ? 6 : 1),
          effects: [],
        });
      }
    }
    if (board.length - start !== 8) throw new Error("棋盘每行必须八格");
  }
  if (board.length !== 64 || !["w", "b"].includes(active))
    throw new Error("棋盘编码无效");
  for (const color of ["white", "black"] as const) {
    if (board.filter((p) => p?.kind === "k" && p.color === color).length !== 1)
      throw new Error("每方必须恰好有一个国王");
    const k = color === "white" ? 60 : 4;
    const kingRight = rights.includes(color === "white" ? "K" : "k"),
      queenRight = rights.includes(color === "white" ? "Q" : "q");
    if (board[k]?.kind === "k" && board[k]?.color === color)
      board[k]!.moved = !(kingRight || queenRight);
    if (board[k + 3]?.kind === "r") board[k + 3]!.moved = !kingRight;
    if (board[k - 4]?.kind === "r") board[k - 4]!.moved = !queenRight;
  }
  const turn: Color = active === "w" ? "white" : "black";
  const s: GameState = {
    schema: 1,
    board,
    turn,
    ply: (Math.max(1, Number(full)) - 1) * 2 + (turn === "black" ? 1 : 0),
    version: 0,
    phase: "play",
    rules,
    rng: seed >>> 0 || 1,
    cardSerial: 0,
    hands: { white: [], black: [] },
    revealed: { white: [], black: [] },
    tiles: [],
    grave: [],
    rewarded: [],
    ep: null,
    halfmove: Math.max(0, Number(half)),
    repetitions: {},
    history: [],
    result: null,
  };
  if (distance(kingSquare(s, "white"), kingSquare(s, "black")) <= 1)
    throw new Error("国王不能相邻");
  if (/^[a-h][36]$/.test(ep)) {
    const at = square(ep),
      pawnSquare = at + (turn === "white" ? 8 : -8),
      pawn = board[pawnSquare];
    if (pawn?.kind === "p" && pawn.color !== turn)
      s.ep = { square: at, pawnSquare, pawnId: pawn.id };
  }
  if (rules === "magic")
    for (const color of ["white", "black"] as const)
      for (let i = 0; i < 3; i++) draw(s, color, 0);
  s.repetitions[positionKey(s)] = 1;
  return s;
}

export const createGame = (rules: RuleSet = "magic", seed = Date.now()) =>
  fromFEN(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    rules,
    seed,
  );

function expire(s: GameState, nextPly: number) {
  for (const p of s.board)
    if (p) p.effects = p.effects.filter((e) => e.until > nextPly);
  s.tiles = s.tiles.filter((t) => t.until > nextPly);
}

function rays(
  s: GameState,
  at: number,
  p: Piece,
  directions: number[][],
  attacks: boolean,
): number[] {
  const out: number[] = [];
  for (const [dx, dy] of directions) {
    let skipped = 0;
    for (let n = 1; n <= (activeEffect(p, "slow") ? 2 : 7); n++) {
      const to = step(at, dx * n, dy * n);
      if (to < 0 || isWall(s, to)) break;
      const target = s.board[to];
      if (
        attacks ||
        (!blocked(s, to) &&
          (!target || (target.color !== p.color && target.kind !== "k")))
      )
        out.push(to);
      if (target) {
        if (activeEffect(p, "jump") && !skipped && target.kind !== "k")
          skipped++;
        else break;
      }
    }
  }
  return out;
}

export function attacksFrom(s: GameState, at: number): number[] {
  const p = s.board[at];
  if (!p || activeEffect(p, "frozen") || activeEffect(p, "noCapture"))
    return [];
  const dir = p.color === "white" ? -1 : 1;
  if (p.kind === "p")
    return [
      [-1, dir],
      [1, dir],
      ...(activeEffect(p, "large") ? [[0, dir]] : []),
    ]
      .map(([x, y]) => step(at, x, y))
      .filter(validSquare);
  if (p.kind === "n")
    return KNIGHT.map(([x, y]) => step(at, x, y)).filter(validSquare);
  if (p.kind === "k")
    return [...ORTHO, ...DIAG]
      .map(([x, y]) => step(at, x, y))
      .filter(validSquare);
  return rays(
    s,
    at,
    p,
    p.kind === "b" || activeEffect(p, "diagonal")
      ? DIAG
      : p.kind === "r"
        ? ORTHO
        : [...ORTHO, ...DIAG],
    true,
  );
}

export function isAttacked(s: GameState, at: number, by: Color): boolean {
  return s.board.some(
    (p, i) => p?.color === by && attacksFrom(s, i).includes(at),
  );
}
export function inCheck(s: GameState, color = s.turn) {
  return isAttacked(s, kingSquare(s, color), other(color));
}

function pseudoMoves(s: GameState, at: number): Move[] {
  const p = s.board[at];
  if (!p || p.color !== s.turn || activeEffect(p, "frozen")) return [];
  const moves: Move[] = [];
  const add = (to: number, extras: Partial<Move> = {}) => {
    if (!validSquare(to) || blocked(s, to)) return;
    const target = s.board[to];
    if (
      target &&
      (target.color === p.color ||
        target.kind === "k" ||
        activeEffect(p, "noCapture"))
    )
      return;
    if (p.kind === "p" && (row(to) === 0 || row(to) === 7))
      for (const promotion of PROMOTIONS)
        moves.push({ from: at, to, promotion, ...extras });
    else moves.push({ from: at, to, ...extras });
  };
  if (p.kind === "p") {
    const dir = p.color === "white" ? -1 : 1,
      forward = step(at, 0, dir);
    if (forward >= 0 && !s.board[forward] && !blocked(s, forward)) {
      add(forward);
      const twice = step(at, 0, dir * 2);
      if (
        !p.moved &&
        row(at) === (p.color === "white" ? 6 : 1) &&
        twice >= 0 &&
        !s.board[twice]
      )
        add(twice);
    }
    if (!activeEffect(p, "noCapture")) {
      for (const dx of [-1, 1]) {
        const to = step(at, dx, dir);
        if (to >= 0 && s.board[to]?.color === other(p.color)) add(to);
        if (
          to >= 0 &&
          s.ep?.square === to &&
          !s.board[to] &&
          s.board[s.ep.pawnSquare]?.id === s.ep.pawnId
        )
          add(to, { enPassant: true });
      }
      if (
        activeEffect(p, "large") &&
        forward >= 0 &&
        s.board[forward]?.color === other(p.color)
      )
        add(forward);
    }
    if (activeEffect(p, "slide"))
      for (const dx of [-1, 1]) {
        const to = step(at, dx, 0);
        if (to >= 0 && !s.board[to]) add(to);
      }
    if (
      s.tiles.some(
        (t) =>
          t.type === "water" &&
          t.owner === p.color &&
          distance(t.square, at) <= 1,
      )
    ) {
      for (const [dx, dy] of [...ORTHO].filter(([, y]) => y !== dir)) {
        const to = step(at, dx, dy);
        if (to >= 0 && !s.board[to]) add(to);
      }
    }
  } else if (p.kind === "n" || p.kind === "k") {
    for (const [dx, dy] of p.kind === "n" ? KNIGHT : [...ORTHO, ...DIAG])
      add(step(at, dx, dy));
    if (p.kind === "n" && activeEffect(p, "small"))
      for (const [dx, dy] of ORTHO) {
        const to = step(at, dx, dy);
        if (to >= 0 && !s.board[to]) add(to);
      }
    if (
      p.kind === "k" &&
      !p.moved &&
      at === (p.color === "white" ? 60 : 4) &&
      !inCheck(s, p.color)
    ) {
      for (const side of ["king", "queen"] as const) {
        const rookAt = at + (side === "king" ? 3 : -4),
          rook = s.board[rookAt],
          direction = side === "king" ? 1 : -1;
        const path =
          side === "king" ? [at + 1, at + 2] : [at - 1, at - 2, at - 3];
        if (
          rook?.kind === "r" &&
          rook.color === p.color &&
          !rook.moved &&
          !activeEffect(rook, "frozen") &&
          path.every((n) => !s.board[n] && !blocked(s, n)) &&
          [at + direction, at + direction * 2].every(
            (n) => !isAttacked(s, n, other(p.color)),
          )
        )
          add(at + direction * 2, { castle: side });
      }
    }
  } else
    for (const to of rays(
      s,
      at,
      p,
      p.kind === "b" || activeEffect(p, "diagonal")
        ? DIAG
        : p.kind === "r"
          ? ORTHO
          : [...ORTHO, ...DIAG],
      false,
    ))
      add(to);
  return moves;
}

function rawMove(
  s: GameState,
  m: Move,
): { state: GameState; captured: Piece | null } {
  const n = clone(s),
    p = n.board[m.from]!;
  const victimAt = m.enPassant ? n.ep!.pawnSquare : m.to;
  const captured = n.board[victimAt];
  if (captured) {
    n.grave.push({ piece: clone(captured), square: victimAt });
    n.board[victimAt] = null;
  }
  n.board[m.from] = null;
  n.board[m.to] = p;
  p.moved = true;
  n.ep =
    p.kind === "p" &&
    file(m.from) === file(m.to) &&
    Math.abs(row(m.from) - row(m.to)) === 2
      ? { square: (m.from + m.to) / 2, pawnSquare: m.to, pawnId: p.id }
      : null;
  n.halfmove = p.kind === "p" || captured ? 0 : n.halfmove + 1;
  if (m.promotion) p.kind = m.promotion;
  if (m.castle) {
    const rookFrom = m.from + (m.castle === "king" ? 3 : -4),
      rookTo = m.from + (m.castle === "king" ? 1 : -1);
    n.board[rookTo] = n.board[rookFrom];
    n.board[rookFrom] = null;
    n.board[rookTo]!.moved = true;
  }
  expire(n, s.ply + 1);
  return { state: n, captured };
}

export function legalMoves(s: GameState, from?: number): Move[] {
  if (s.result || (s.phase !== "play" && s.phase !== "move")) return [];
  const candidates =
    from === undefined
      ? s.board.flatMap((p, i) =>
          p?.color === s.turn ? pseudoMoves(s, i) : [],
        )
      : pseudoMoves(s, from);
  return candidates.filter((m) => !inCheck(rawMove(s, m).state, s.turn));
}

function addEffect(s: GameState, at: number, type: EffectType, duration = 2) {
  const p = s.board[at]!;
  p.effects = p.effects.filter((e) => e.type !== type);
  p.effects.push({ type, until: s.ply + duration, source: s.turn });
}
function relocate(s: GameState, from: number, to: number) {
  const p = s.board[from]!;
  s.board[to] = p;
  s.board[from] = null;
  p.moved = true;
  if (s.ep?.pawnId === p.id) s.ep = null;
  if (p.kind === "p") s.halfmove = 0;
}

function castUnchecked(state: GameState, action: Cast): GameState {
  if (!action || typeof action.cardId !== "string")
    throw new Error("技能参数无效");
  if (state.rules !== "magic" || state.phase !== "play" || state.result)
    throw new Error("当前不能施法");
  const s = clone(state),
    card = s.hands[s.turn].find((c) => c.id === action.cardId);
  if (!card || card.readyPly > s.ply)
    throw new Error("技能不存在或要到下回合才能使用");
  const def = spellById[card.spell];
  if (
    !def ||
    !Array.isArray(action.targets) ||
    action.targets.length !== def.targets ||
    !action.targets.every(validSquare)
  )
    throw new Error("请选择正确的技能目标");
  const [a, b] = action.targets,
    p = s.board[a],
    me = s.turn,
    enemy = other(me);
  const own = !!p && p.color === me && p.kind !== "k",
    foe = !!p && p.color === enemy && p.kind !== "k";
  const hasNegative = !!p && p.effects.some((e) => NEGATIVE.includes(e.type));
  let valid = false;
  switch (card.spell) {
    case "leviosa":
      valid = own && ["r", "b"].includes(p!.kind);
      break;
    case "accio":
      valid =
        own &&
        ["n", "b"].includes(p!.kind) &&
        !s.board[b] &&
        !blocked(s, b) &&
        distance(a, b) >= 1 &&
        distance(a, b) <= 2 &&
        distance(b, kingSquare(s, me)) < distance(a, kingSquare(s, me));
      break;
    case "glisseo":
      valid = own && p!.kind === "p";
      break;
    case "waddiwasi": {
      const to = step(a, 0, me === "white" ? -1 : 1);
      valid =
        own &&
        p!.kind === "p" &&
        validSquare(to) &&
        row(to) !== 0 &&
        row(to) !== 7 &&
        !s.board[to] &&
        !blocked(s, to);
      break;
    }
    case "protego":
      valid = own && !activeEffect(p!, "ward");
      break;
    case "patronum":
      valid = own && p!.kind === "p";
      break;
    case "finite":
    case "riddikulus":
      valid = own && hasNegative;
      break;
    case "reparo":
      valid =
        !p &&
        !blocked(s, a) &&
        row(a) === (me === "white" ? 6 : 1) &&
        s.grave.some(
          (g) =>
            g.piece.color === me &&
            g.piece.kind === "p" &&
            file(Number(g.piece.id.split("-").at(-1))) === file(a),
        );
      break;
    case "petrificus":
      valid = foe && ["n", "b"].includes(p!.kind);
      break;
    case "impedimenta":
      valid = foe && ["r", "b", "q"].includes(p!.kind);
      break;
    case "stupefy":
      valid = foe && p!.kind === "p";
      break;
    case "tarantallegra":
      valid = foe && p!.kind === "q";
      break;
    case "incendio":
      valid =
        !p &&
        row(a) >= 2 &&
        row(a) <= 5 &&
        !s.tiles.some((t) => t.square === a) &&
        distance(a, kingSquare(s, me)) > 1 &&
        distance(a, kingSquare(s, enemy)) > 1;
      break;
    case "aguamenti":
      valid = !p && row(a) >= 2 && row(a) <= 5;
      break;
    case "colloportus":
      valid =
        !p &&
        !s.tiles.some((t) => t.square === a) &&
        distance(a, kingSquare(s, me)) <= 2 &&
        distance(a, kingSquare(s, enemy)) > 1;
      break;
    case "alohomora":
      valid = s.tiles.some((t) => t.square === a && t.type !== "water");
      break;
    case "expelliarmus":
      valid =
        foe &&
        ["n", "b"].includes(p!.kind) &&
        !s.board[b] &&
        !blocked(s, b) &&
        distance(a, b) === 1;
      break;
    case "diffindo":
      valid =
        (foe && p!.effects.some((e) => POSITIVE.includes(e.type))) ||
        s.tiles.some((t) => t.square === a);
      break;
    case "engorgio":
      valid = own && p!.kind === "p";
      break;
    case "reducio":
      valid = own && p!.kind === "n";
      break;
    case "lumos":
      valid = s.hands[enemy].some((c) => !s.revealed[enemy].includes(c.id));
      break;
    case "nox":
      valid = own && ["p", "n"].includes(p!.kind);
      break;
    case "obliviate":
      valid = s.hands[enemy].length > 0;
      break;
  }
  if (!valid) throw new Error("这个目标不符合技能条件");
  if (foe && activeEffect(p!, "veil")) throw new Error("目标处于诺克斯保护中");
  const absorbed = foe && card.spell !== "diffindo" && activeEffect(p!, "ward");
  if (absorbed) p!.effects = p!.effects.filter((e) => e.type !== "ward");
  else
    switch (card.spell) {
      case "leviosa":
        addEffect(s, a, "jump", 1);
        break;
      case "accio":
      case "expelliarmus":
        relocate(s, a, b);
        break;
      case "glisseo":
        addEffect(s, a, "slide", 1);
        break;
      case "waddiwasi":
        relocate(s, a, step(a, 0, me === "white" ? -1 : 1));
        break;
      case "protego":
        addEffect(s, a, "ward");
        break;
      case "patronum": {
        addEffect(s, a, "ward");
        const second = s.board.findIndex(
          (piece, i) =>
            i !== a &&
            piece?.color === me &&
            piece.kind === "p" &&
            distance(i, a) === 1,
        );
        if (second >= 0) addEffect(s, second, "ward");
        break;
      }
      case "finite":
        p!.effects = p!.effects.filter((e) => !NEGATIVE.includes(e.type));
        break;
      case "riddikulus": {
        const index = p!.effects.findIndex((e) => NEGATIVE.includes(e.type));
        p!.effects.splice(index, 1);
        addEffect(s, a, "ward");
        break;
      }
      case "reparo": {
        const index = s.grave.findIndex(
          (g) =>
            g.piece.color === me &&
            g.piece.kind === "p" &&
            file(Number(g.piece.id.split("-").at(-1))) === file(a),
        );
        const revived = s.grave.splice(index, 1)[0].piece;
        revived.moved = true;
        revived.effects = [];
        s.board[a] = revived;
        s.halfmove = 0;
        break;
      }
      case "petrificus":
        addEffect(s, a, "frozen");
        break;
      case "impedimenta":
        addEffect(s, a, "slow");
        break;
      case "stupefy":
        addEffect(s, a, "noCapture");
        break;
      case "tarantallegra":
        addEffect(s, a, "diagonal");
        break;
      case "incendio":
      case "colloportus":
        s.tiles.push({
          square: a,
          type: card.spell === "incendio" ? "fire" : "wall",
          until: s.ply + 2,
          owner: me,
        });
        break;
      case "aguamenti":
        s.tiles = s.tiles.filter((t) => t.square !== a);
        s.tiles.push({ square: a, type: "water", until: s.ply + 1, owner: me });
        break;
      case "alohomora": {
        s.tiles = s.tiles.filter((t) => t.square !== a);
        const allies = s.board
          .map((piece, i) => ({ piece, i }))
          .filter(
            (x) => x.piece?.color === me && ["r", "b"].includes(x.piece.kind),
          )
          .sort((x, y) => distance(x.i, a) - distance(y.i, a));
        if (allies[0]) addEffect(s, allies[0].i, "jump", 1);
        break;
      }
      case "diffindo":
        if (p) p.effects = p.effects.filter((e) => !POSITIVE.includes(e.type));
        s.tiles = s.tiles.filter((t) => t.square !== a);
        break;
      case "engorgio":
        addEffect(s, a, "large");
        break;
      case "reducio":
        addEffect(s, a, "small", 1);
        break;
      case "nox":
        addEffect(s, a, "veil");
        break;
      case "lumos": {
        const unknown = s.hands[enemy].filter(
          (c) => !s.revealed[enemy].includes(c.id),
        );
        s.revealed[enemy].push(
          unknown[Math.floor(random(s) * unknown.length)].id,
        );
        break;
      }
      case "obliviate": {
        const index = Math.floor(random(s) * s.hands[enemy].length),
          removed = s.hands[enemy].splice(index, 1)[0];
        s.revealed[enemy] = s.revealed[enemy].filter((id) => id !== removed.id);
        draw(s, enemy, s.ply + 1);
        break;
      }
    }
  s.hands[me] = s.hands[me].filter((c) => c.id !== card.id);
  s.revealed[me] = s.revealed[me].filter((id) => id !== card.id);
  s.phase = "move";
  s.history.push({
    ply: s.ply,
    color: me,
    type: "cast",
    text: `${def.name}${absorbed ? " · 护盾抵挡" : ""}`,
    spell: card.spell,
    from: a,
    to: b,
  });
  return s;
}

export function canCast(s: GameState, action: Cast): boolean {
  try {
    return legalMoves(castUnchecked(s, action)).length > 0;
  } catch {
    return false;
  }
}

export function possibleCasts(
  s: GameState,
  cardId?: string,
  limit = Infinity,
): Cast[] {
  if (s.rules !== "magic" || s.phase !== "play" || s.result) return [];
  const result: Cast[] = [];
  for (const card of s.hands[s.turn]) {
    if ((cardId && card.id !== cardId) || card.readyPly > s.ply) continue;
    const count = spellById[card.spell].targets;
    if (!count) {
      const cast = { cardId: card.id, targets: [] };
      if (canCast(s, cast)) result.push(cast);
    } else
      for (let a = 0; a < 64; a++) {
        if (count === 1) {
          const cast = { cardId: card.id, targets: [a] };
          if (canCast(s, cast)) result.push(cast);
        } else if (
          s.board[a] &&
          s.board[a]!.kind !== "k" &&
          (card.spell === "accio"
            ? s.board[a]!.color === s.turn
            : s.board[a]!.color !== s.turn) &&
          ["n", "b"].includes(s.board[a]!.kind)
        ) {
          for (let b = 0; b < 64; b++)
            if (
              !s.board[b] &&
              distance(a, b) <= (card.spell === "accio" ? 2 : 1)
            ) {
              const cast = { cardId: card.id, targets: [a, b] };
              if (canCast(s, cast)) result.push(cast);
              if (result.length >= limit) return result;
            }
        }
        if (result.length >= limit) return result;
      }
    if (result.length >= limit) return result;
  }
  return result;
}

export function positionKey(s: GameState): string {
  const board = s.board
    .map((p) =>
      !p
        ? "."
        : `${p.color[0]}${p.kind}${p.kind === "p" && p.moved ? "m" : ""}${
            s.rules === "magic"
              ? p.id +
                p.effects
                  .map((e) => `${e.type}:${e.until - s.ply}`)
                  .sort()
                  .join(",")
              : ""
          }`,
    )
    .join("/");
  const ep = s.ep && legalMoves(s).some((m) => m.enPassant) ? s.ep.square : "-";
  const rights = (["white", "black"] as const).flatMap((color) => {
    const at = color === "white" ? 60 : 4,
      king = s.board[at];
    if (king?.kind !== "k" || king.color !== color || king.moved) return [];
    return [3, -4].flatMap((offset) => {
      const rook = s.board[at + offset];
      return rook?.kind === "r" && rook.color === color && !rook.moved
        ? [`${color}:${offset}`]
        : [];
    });
  });
  return JSON.stringify([
    board,
    s.turn,
    ep,
    rights,
    ...(s.rules === "magic"
      ? [
          s.tiles.map((t) => [t.square, t.type, t.until - s.ply, t.owner]),
          ...(["white", "black"] as const).map((c) =>
            s.hands[c]
              .map((h) => [h.spell, Math.max(0, h.readyPly - s.ply)])
              .sort(),
          ),
          s.rewarded.slice().sort(),
          s.grave.map((g) => [g.piece.id, g.piece.kind]).sort(),
          ...(["white", "black"] as const).map((c) =>
            s.revealed[c].slice().sort(),
          ),
          s.rng,
        ]
      : []),
  ]);
}

function terminal(s: GameState): Result | null {
  if (!legalMoves(s).length && !possibleCasts(s, undefined, 1).length)
    return {
      winner: inCheck(s) ? other(s.turn) : null,
      reason: inCheck(s) ? "checkmate" : "stalemate",
    };
  if (s.halfmove >= 100) return { winner: null, reason: "fifty-move" };
  if ((s.repetitions[positionKey(s)] ?? 0) >= 3)
    return { winner: null, reason: "repetition" };
  if (
    !s.hands.white.length &&
    !s.hands.black.length &&
    !s.tiles.length &&
    !s.board.some((p) => p?.effects.length)
  ) {
    const pieces = s.board.flatMap((p, i) =>
      p && p.kind !== "k" ? [{ p, i }] : [],
    );
    if (
      !pieces.length ||
      (pieces.length === 1 && ["n", "b"].includes(pieces[0].p.kind)) ||
      (pieces.every((x) => x.p.kind === "b") &&
        new Set(pieces.map((x) => (file(x.i) + row(x.i)) % 2)).size === 1)
    )
      return { winner: null, reason: "insufficient" };
  }
  return null;
}

function completeTurn(s: GameState) {
  s.turn = other(s.turn);
  s.ply++;
  s.phase = "play";
  for (const color of ["white", "black"] as const)
    s.revealed[color] = s.revealed[color].filter((id) =>
      s.hands[color].some((c) => c.id === id),
    );
  const key = positionKey(s);
  s.repetitions[key] = (s.repetitions[key] ?? 0) + 1;
  s.result = terminal(s);
  if (s.result) s.phase = "over";
  if (s.history.length > 256) s.history = s.history.slice(-256);
}

export function applyAction(state: GameState, action: Action): GameState {
  if (!action || !["move", "cast", "discard", "resign"].includes(action.type))
    throw new Error("未知操作");
  if (state.result) throw new Error("对局已经结束");
  if (action.type === "resign") {
    const s = clone(state);
    s.result = { winner: other(s.turn), reason: "resign" };
    s.phase = "over";
    s.version++;
    return s;
  }
  if (action.type === "cast") {
    const s = castUnchecked(state, action.cast);
    if (!legalMoves(s).length)
      throw new Error("施法后没有合法棋步，技能未消耗");
    s.version++;
    return s;
  }
  if (action.type === "discard") {
    if (
      state.phase !== "discard" ||
      state.hands[state.turn].length !== 4 ||
      !state.hands[state.turn].some((c) => c.id === action.cardId)
    )
      throw new Error("当前没有待取舍的手牌");
    const s = clone(state);
    s.hands[s.turn] = s.hands[s.turn].filter((c) => c.id !== action.cardId);
    s.version++;
    completeTurn(s);
    return s;
  }
  const request = action.move;
  if (!request || !validSquare(request.from) || !validSquare(request.to))
    throw new Error("棋格无效");
  const move = legalMoves(state, request.from).find(
    (m) =>
      m.to === request.to &&
      (m.promotion ?? "q") === (request.promotion ?? "q"),
  );
  if (!move) throw new Error("这一步会违反棋规或暴露国王");
  const actor = state.turn,
    original = state.board[move.from]!,
    { state: s, captured } = rawMove(state, move);
  s.history.push({
    ply: state.ply,
    color: actor,
    type: "move",
    from: move.from,
    to: move.to,
    captured: captured?.kind,
    capturedId: captured?.id,
    text: move.castle
      ? move.castle === "king"
        ? "O-O"
        : "O-O-O"
      : `${pieceName[original.kind]} ${squareName(move.from)}${captured ? " × " : " → "}${squareName(move.to)}${move.promotion ? ` = ${pieceName[move.promotion]}` : ""}`,
  });
  if (s.halfmove === 0) s.repetitions = {};
  if (
    s.rules === "magic" &&
    captured &&
    captured.kind !== "p" &&
    !s.rewarded.includes(captured.id)
  ) {
    s.rewarded.push(captured.id);
    draw(s, actor, state.ply + 2);
  }
  s.version++;
  if (s.hands[actor].length > 3) {
    const probe = clone(s);
    probe.hands[actor].pop();
    completeTurn(probe);
    if (probe.result) {
      s.hands[actor].pop();
      completeTurn(s);
    } else s.phase = "discard";
  } else completeTurn(s);
  return s;
}

export function previewMove(state: GameState, move: Move): GameState {
  return rawMove(state, move).state;
}
export function previewCast(state: GameState, cast: Cast): GameState {
  return castUnchecked(state, cast);
}
export function evaluateResult(s: GameState): Result | null {
  return terminal(s);
}

// Every persistence/network boundary validates nested values before the UI reads them.
export function validateSavedGame(
  input: unknown,
  allowRedacted = false,
): input is GameState {
  const object = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x);
  const integer = (x: unknown, max = 10002): x is number =>
    Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max;
  const color = (x: unknown) => x === "white" || x === "black";
  const id = (x: unknown): x is string =>
    typeof x === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(x);
  const kind = (x: unknown) => typeof x === "string" && /^[pnbrqk]$/.test(x);
  const spell = (x: unknown): x is string =>
    typeof x === "string" && Object.hasOwn(spellById, x);
  const at = (x: unknown): x is number => integer(x, 63);
  const piece = (p: unknown): p is Piece =>
    object(p) &&
    id(p.id) &&
    color(p.color) &&
    kind(p.kind) &&
    kind(p.origin) &&
    typeof p.moved === "boolean" &&
    Array.isArray(p.effects) &&
    p.effects.length <= 10 &&
    new Set(p.effects.map((e) => (object(e) ? e.type : null))).size ===
      p.effects.length &&
    p.effects.every(
      (e) =>
        object(e) &&
        [...NEGATIVE, ...POSITIVE].includes(e.type as EffectType) &&
        integer(e.until) &&
        color(e.source),
    );
  if (!object(input)) return false;
  const s = input as unknown as GameState;
  if (
    s.schema !== 1 ||
    !Array.isArray(s.board) ||
    s.board.length !== 64 ||
    !color(s.turn) ||
    !["magic", "classic"].includes(s.rules) ||
    !["play", "move", "discard", "over"].includes(s.phase) ||
    !integer(s.ply, 10000) ||
    !integer(s.version, 100000) ||
    !integer(s.rng, 4294967295) ||
    (!allowRedacted && s.rng === 0) ||
    !integer(s.cardSerial, 100000) ||
    !integer(s.halfmove, 10000)
  )
    return false;
  if (
    !object(s.hands) ||
    !object(s.revealed) ||
    !object(s.repetitions) ||
    !Array.isArray(s.tiles) ||
    !Array.isArray(s.grave) ||
    !Array.isArray(s.rewarded) ||
    !Array.isArray(s.history) ||
    s.history.length > 256 ||
    s.tiles.length > 64 ||
    s.grave.length > 30 ||
    s.rewarded.length > 32
  )
    return false;
  const ids = new Set<string>(),
    cardIds = new Set<string>();
  for (const p of s.board)
    if (p !== null) {
      if (!piece(p) || ids.has(p.id)) return false;
      ids.add(p.id);
    }
  for (const g of s.grave) {
    if (
      !object(g) ||
      !piece(g.piece) ||
      g.piece.kind === "k" ||
      !at(g.square) ||
      ids.has(g.piece.id)
    )
      return false;
    ids.add(g.piece.id);
  }
  if (
    ids.size > 32 ||
    !s.rewarded.every(id) ||
    new Set(s.rewarded).size !== s.rewarded.length
  )
    return false;
  for (const c of ["white", "black"] as const) {
    if (
      s.board.filter((p) => p?.color === c && p.kind === "k").length !== 1 ||
      !Array.isArray(s.hands[c]) ||
      s.hands[c].length > 4 ||
      !Array.isArray(s.revealed[c]) ||
      s.revealed[c].length > 4
    )
      return false;
    for (const card of s.hands[c]) {
      if (
        !object(card) ||
        !id(card.id) ||
        cardIds.has(card.id) ||
        !spell(card.spell) ||
        !integer(card.readyPly)
      )
        return false;
      cardIds.add(card.id);
    }
    if (
      !s.revealed[c].every(
        (r) => id(r) && s.hands[c].some((card) => card.id === r),
      ) ||
      new Set(s.revealed[c]).size !== s.revealed[c].length
    )
      return false;
  }
  if (distance(kingSquare(s, "white"), kingSquare(s, "black")) <= 1)
    return false;
  if (s.phase === "discard" && !allowRedacted && s.hands[s.turn].length !== 4)
    return false;
  if (
    s.tiles.some(
      (t) =>
        !object(t) ||
        !at(t.square) ||
        !["fire", "wall", "water"].includes(t.type) ||
        !integer(t.until) ||
        !color(t.owner),
    ) ||
    new Set(s.tiles.map((t) => t.square)).size !== s.tiles.length
  )
    return false;
  if (
    s.ep !== null &&
    (!object(s.ep) ||
      !at(s.ep.square) ||
      !at(s.ep.pawnSquare) ||
      !id(s.ep.pawnId) ||
      s.board[s.ep.pawnSquare]?.id !== s.ep.pawnId ||
      s.board[s.ep.pawnSquare]?.kind !== "p")
  )
    return false;
  if (
    s.history.some(
      (h) =>
        !object(h) ||
        !integer(h.ply) ||
        !color(h.color) ||
        !["move", "cast"].includes(h.type) ||
        typeof h.text !== "string" ||
        h.text.length > 256 ||
        (h.from !== undefined && !at(h.from)) ||
        (h.to !== undefined && !at(h.to)) ||
        (h.captured !== undefined && !kind(h.captured)) ||
        (h.capturedId !== undefined && !id(h.capturedId)) ||
        (h.spell !== undefined && !spell(h.spell)),
    )
  )
    return false;
  const repetitions = Object.entries(s.repetitions);
  if (
    repetitions.length > 10001 ||
    repetitions.some(
      ([key, count]) =>
        key.length > 16384 || !integer(count, 10001) || count === 0,
    )
  )
    return false;
  if (
    s.result !== null &&
    (!object(s.result) ||
      (s.result.winner !== null && !color(s.result.winner)) ||
      ![
        "checkmate",
        "stalemate",
        "repetition",
        "fifty-move",
        "insufficient",
        "resign",
      ].includes(s.result.reason))
  )
    return false;
  return (s.phase === "over") === (s.result !== null);
}
