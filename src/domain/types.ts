export type Color = "white" | "black";
export type Kind = "p" | "n" | "b" | "r" | "q" | "k";
export type RuleSet = "magic" | "classic";
export type EffectType =
  | "frozen"
  | "slow"
  | "noCapture"
  | "diagonal"
  | "ward"
  | "veil"
  | "jump"
  | "slide"
  | "large"
  | "small";
export interface Effect {
  type: EffectType;
  until: number;
  source: Color;
}
export interface Piece {
  id: string;
  color: Color;
  kind: Kind;
  origin: Kind;
  moved: boolean;
  effects: Effect[];
}
export type SpellId =
  | "leviosa"
  | "accio"
  | "glisseo"
  | "waddiwasi"
  | "protego"
  | "patronum"
  | "finite"
  | "reparo"
  | "petrificus"
  | "impedimenta"
  | "stupefy"
  | "tarantallegra"
  | "incendio"
  | "aguamenti"
  | "colloportus"
  | "alohomora"
  | "expelliarmus"
  | "diffindo"
  | "engorgio"
  | "reducio"
  | "lumos"
  | "nox"
  | "obliviate"
  | "riddikulus";
export interface Card {
  id: string;
  spell: SpellId;
  readyPly: number;
}
export interface TileEffect {
  square: number;
  type: "fire" | "wall" | "water";
  until: number;
  owner: Color;
}
export interface Move {
  from: number;
  to: number;
  promotion?: Exclude<Kind, "p" | "k">;
  castle?: "king" | "queen";
  enPassant?: boolean;
}
export interface Cast {
  cardId: string;
  targets: number[];
}
export type Action =
  | { type: "move"; move: Move }
  | { type: "cast"; cast: Cast }
  | { type: "discard"; cardId: string }
  | { type: "resign" };
export interface RecordEntry {
  ply: number;
  color: Color;
  type: "move" | "cast";
  text: string;
  from?: number;
  to?: number;
  captured?: Kind;
  capturedId?: string;
  spell?: SpellId;
}
export interface Result {
  winner: Color | null;
  reason:
    | "checkmate"
    | "stalemate"
    | "repetition"
    | "fifty-move"
    | "insufficient"
    | "resign";
}
export interface GameState {
  schema: 1;
  board: (Piece | null)[];
  turn: Color;
  ply: number;
  version: number;
  phase: "play" | "move" | "discard" | "over";
  rules: RuleSet;
  rng: number;
  cardSerial: number;
  hands: Record<Color, Card[]>;
  revealed: Record<Color, string[]>;
  tiles: TileEffect[];
  grave: { piece: Piece; square: number }[];
  rewarded: string[];
  ep: { square: number; pawnSquare: number; pawnId: string } | null;
  halfmove: number;
  repetitions: Record<string, number>;
  history: RecordEntry[];
  result: Result | null;
}
export interface SpellDef {
  id: SpellId;
  name: string;
  latin: string;
  category: string;
  icon: string;
  description: string;
  targets: 0 | 1 | 2;
  tone: string;
}
export const other = (color: Color): Color =>
  color === "white" ? "black" : "white";
export const file = (square: number) => square % 8;
export const row = (square: number) => Math.floor(square / 8);
export const distance = (a: number, b: number) =>
  Math.max(Math.abs(file(a) - file(b)), Math.abs(row(a) - row(b)));
export const squareName = (n: number) => `${"abcdefgh"[file(n)]}${8 - row(n)}`;
export const square = (name: string) =>
  (8 - Number(name[1])) * 8 + "abcdefgh".indexOf(name[0]);
export const pieceName: Record<Kind, string> = {
  p: "兵",
  n: "骑士",
  b: "主教",
  r: "城堡",
  q: "王后",
  k: "国王",
};
export const effectName: Record<EffectType, string> = {
  frozen: "石化",
  slow: "迟缓",
  noCapture: "无法吃子",
  diagonal: "仅斜行",
  ward: "魔法护盾",
  veil: "诺克斯保护",
  jump: "可越子",
  slide: "可横移",
  large: "可正面吃子",
  small: "可挪动一格",
};
export const values: Record<Kind, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 900,
  k: 20000,
};
