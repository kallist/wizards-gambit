import { fromFEN, positionKey } from "../domain/engine";
import type { Card, GameState, SpellId } from "../domain/types";

export type JourneyNodeId = 0 | 1 | 2;
export type PreparationId = "thread" | "still";

export interface JourneyNode {
  id: JourneyNodeId;
  title: string;
  fen: string;
  whiteMoveLimit: number;
  premise: string;
}

export const JOURNEY_NODES: readonly JourneyNode[] = [
  {
    id: 0,
    title: "借一束光",
    fen: "7k/8/5Kn1/4Q3/8/3B4/8/8 w - - 0 1",
    whiteMoveLimit: 3,
    premise: "挪开国王会露出后方的将军线；先商量是否借一次引线。",
  },
  {
    id: 1,
    title: "绕过守夜人",
    fen: "7k/8/7n/5K2/5Q2/8/4B3/8 w - - 0 1",
    whiteMoveLimit: 3,
    premise: "国王正受骑士威胁。可以先除去守子，也可借主教打开另一条线。",
  },
  {
    id: 2,
    title: "窗边的最后一局",
    fen: "5nk1/8/5K2/4Q3/8/8/2B5/8 w - - 0 1",
    whiteMoveLimit: 3,
    premise: "骑士守着最后的封口；现在用支援，还是保留到下一次商量？",
  },
];

export const PREPARATIONS: Record<
  PreparationId,
  { title: string; description: string; spells: readonly SpellId[] }
> = {
  thread: {
    title: "引线银扣",
    description: "两次飞来咒、一次统统石化；整程共用，用过便留在这一晚。",
    spells: ["accio", "accio", "petrificus"],
  },
  still: {
    title: "定步银扣",
    description: "两次统统石化、一次飞来咒；整程共用，用过便留在这一晚。",
    spells: ["petrificus", "petrificus", "accio"],
  },
};

export function preparationCards(preparation: PreparationId): Card[] {
  return PREPARATIONS[preparation].spells.map((spell, index) => ({
    id: `journey-${index + 1}`,
    spell,
    readyPly: 0,
  }));
}

export function createNodeGame(
  nodeId: JourneyNodeId,
  cards: readonly Card[],
  seed: number,
): GameState {
  const node = JOURNEY_NODES[nodeId];
  if (!node || node.id !== nodeId) throw new Error("未知棋旅节点");
  // Start without the normal magic opening draw. The authored, public hand is
  // carried between nodes; ordinary and friend games keep their own draw rules.
  const game = fromFEN(node.fen, "classic", seed);
  game.rules = "magic";
  game.hands.white = cards.map(({ id, spell }) => ({ id, spell, readyPly: 0 }));
  game.cardSerial = 3;
  game.revealed.white = game.hands.white.map((card) => card.id);
  // These old chess shadows have already awarded cards. Captures never draw
  // from the full pool in this finite journey.
  game.rewarded = game.board.flatMap((piece) =>
    piece && piece.kind !== "k" && piece.kind !== "p" ? [piece.id] : [],
  );
  game.repetitions = { [positionKey(game)]: 1 };
  return game;
}

export function createPractice(
  nodeId: JourneyNodeId,
  preparation: PreparationId,
  seed: number,
): GameState {
  return createNodeGame(nodeId, preparationCards(preparation), seed);
}
