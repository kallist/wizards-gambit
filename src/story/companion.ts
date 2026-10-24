import { characterInteraction } from "./interaction";

export const OUTFITS = [
  { id: "college", name: "绿银学院", style: "学院", starter: true },
  { id: "gala", name: "翡翠晚宴", style: "礼服", starter: true },
  { id: "cream", name: "奶油冬日", style: "甜美" },
  { id: "tea", name: "玫瑰茶会", style: "甜美" },
  { id: "date", name: "法式心事", style: "约会" },
  { id: "travel", name: "轻旅晴天", style: "日常" },
  { id: "summer", name: "湖畔花信", style: "约会" },
  { id: "scholar", name: "书页与星", style: "学院" },
  { id: "rider", name: "英伦骑装", style: "英气" },
  { id: "detective", name: "雨夜侦探", style: "英气" },
  { id: "witch", name: "黑金魔女", style: "魔女" },
  { id: "moon", name: "月光银缎", style: "礼服" },
  { id: "swan", name: "黑天鹅", style: "礼服" },
  { id: "magnolia", name: "玉兰夜语", style: "礼服" },
  { id: "christmas", name: "雪夜圣诞", style: "甜美" },
  { id: "prince", name: "白金贵族", style: "英气" },
  { id: "maid", name: "咖啡时光", style: "甜美" },
  { id: "stars", name: "星辰舞会", style: "礼服" },
  { id: "cocktail", name: "午夜蔷薇", style: "礼服" },
  { id: "leather", name: "黑曜街角", style: "英气" },
  { id: "tailor", name: "偏爱正装", style: "约会" },
  { id: "violet", name: "紫夜骑士", style: "英气" },
  { id: "champagne", name: "香槟余温", style: "礼服" },
  { id: "ruby", name: "赤红宣言", style: "礼服" },
] as const;
export type OutfitId = (typeof OUTFITS)[number]["id"];
export type Expression = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const EXPRESSION_NAMES = [
  "傲娇",
  "浅羞",
  "明显害羞",
  "眨眼",
  "欢笑",
  "气鼓鼓",
  "担心",
  "温柔",
] as const;
export const ALL_OUTFITS = (1 << OUTFITS.length) - 1;
export interface CompanionCloud {
  owned: number;
  heart: number;
}
export interface CompanionProgress extends CompanionCloud {
  schema: 1;
  claimed: string[];
}
export function initialCompanion(legacyTaps = 0): CompanionProgress {
  return {
    schema: 1,
    owned: 3,
    heart: Number.isFinite(legacyTaps)
      ? Math.min(100, Math.max(0, Math.floor(legacyTaps)))
      : 0,
    claimed: [],
  };
}
export function validCompanionCloud(value: unknown): value is CompanionCloud {
  const x = value as CompanionCloud;
  return (
    !!x &&
    typeof x === "object" &&
    Number.isInteger(x.owned) &&
    x.owned >= 3 &&
    x.owned <= ALL_OUTFITS &&
    (x.owned & 3) === 3 &&
    Number.isInteger(x.heart) &&
    x.heart >= 0 &&
    x.heart <= 100
  );
}
export function validMatchId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9:_-]{8,96}$/.test(id);
}
export function decodeCompanion(value: unknown): CompanionProgress | null {
  const x = value as CompanionProgress;
  if (
    !validCompanionCloud(x) ||
    x.schema !== 1 ||
    !Array.isArray(x.claimed) ||
    x.claimed.length > 1024 ||
    (x.claimed.length > 0 && wardrobeCount(x) < 3) ||
    !x.claimed.every(validMatchId) ||
    new Set(x.claimed).size !== x.claimed.length
  )
    return null;
  return { schema: 1, owned: x.owned, heart: x.heart, claimed: [...x.claimed] };
}
export function ownsOutfit(p: CompanionCloud, id: OutfitId) {
  const index = OUTFITS.findIndex((o) => o.id === id);
  return index >= 0 && !!(p.owned & (1 << index));
}
export function outfitById(id: unknown) {
  return OUTFITS.find((o) => o.id === id) ?? OUTFITS[0];
}
export function wardrobeCount(p: CompanionCloud) {
  return OUTFITS.filter((o) => ownsOutfit(p, o.id)).length;
}
export function expressionFor(taps: number, frame?: number): Expression {
  if (frame !== undefined)
    return ([0, 1, 2, 2, 0, 6, 3, 7][frame] as Expression) ?? 0;
  const stage = characterInteraction(taps).stage;
  return stage === 0 ? 0 : stage < 3 ? 1 : stage === 3 ? 2 : 7;
}
export function innerThought(
  heart: number,
  expression: Expression,
  frame?: number,
) {
  if (frame === 4) return "先赢下这一手……再看他有没有在看我。";
  if (frame === 5) return "别逞强。你的下一步，我也在认真想。";
  if (expression === 7) return "只要他在这里，连冬天都会变得温柔。";
  if (expression === 2)
    return heart >= 60
      ? "他说喜欢我的时候，我还是会心跳失控。"
      : "讨厌，脸一定红透了。可我不想让他停下来。";
  if (expression === 1) return "只是靠近一点而已……为什么忽然不敢看他？";
  return heart >= 60
    ? "他又坐到我身边了。很好，今晚也不许走。"
    : "波特最好认真下棋。也可以……偶尔看我一眼。";
}
export function awardOutfit(
  p: CompanionProgress,
  matchId: string,
  choose: (count: number) => number,
) {
  if (!validMatchId(matchId)) throw new Error("对局身份无效");
  if (p.claimed.includes(matchId))
    return { progress: p, outfit: null, status: "duplicate" as const };
  const available = OUTFITS.map((o, i) => ({ ...o, index: i })).filter(
    (o) => !ownsOutfit(p, o.id),
  );
  if (!available.length)
    return { progress: p, outfit: null, status: "complete" as const };
  if (p.claimed.length >= 1024)
    throw new Error("领取记录空间不足，请先导出备份");
  const index = choose(available.length);
  if (!Number.isInteger(index) || index < 0 || index >= available.length)
    throw new Error("衣装抽取失败");
  const outfit = available[index];
  return {
    progress: {
      ...p,
      owned: p.owned | (1 << outfit.index),
      heart: Math.min(100, p.heart + 4),
      claimed: [...p.claimed, matchId],
    },
    outfit: outfit.id,
    status: "awarded" as const,
  };
}
export function mergeCompanion(
  local: CompanionProgress,
  cloud: CompanionCloud,
): CompanionProgress {
  if (!validCompanionCloud(cloud)) throw new Error("衣柜存档格式无效");
  return {
    ...local,
    owned: local.owned | cloud.owned,
    heart: Math.max(local.heart, cloud.heart),
  };
}
