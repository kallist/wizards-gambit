import proud from "../assets/malfoy-v2-proud-fixed.webp";
import shy from "../assets/malfoy-v2-shy.webp";
import casting from "../assets/malfoy-v2-cast.webp";
import gala from "../assets/malfoy-v2-gala.webp";
import hall from "../assets/dorm-v3.webp";
import spells from "../assets/spell-art-v2.webp";
import cg0 from "../assets/cg-v2-0.webp";
import cg1 from "../assets/cg-v2-1.webp";
import cg2 from "../assets/cg-v2-2.webp";
import cg3 from "../assets/cg-v2-3.webp";
import cg4 from "../assets/cg-v2-4.webp";
import cg5 from "../assets/cg-v2-5.webp";
import type { SpellId } from "../domain/types";
import { SPELLS } from "../domain/spells";
import type { OutfitId } from "../story/companion";
const outfitImages = import.meta.glob<string>(
  [
    "../assets/wardrobe-v3-*.webp",
    "../assets/wardrobe-v4-*.webp",
    "!../assets/wardrobe-v3-college*.webp",
    "!../assets/wardrobe-v3-gala*.webp",
    "!../assets/wardrobe-v3-champagne*.webp",
    "!../assets/wardrobe-v3-witch.webp",
  ],
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);
const outfitCGs = import.meta.glob<string>("../assets/outfit-cg-v3-*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
export function outfitArt(id: OutfitId, expression = 0) {
  const suffix =
    expression < 3 ? "" : expression < 6 ? "-expressions-b" : "-expressions-c";
  const src =
    outfitImages[`../assets/wardrobe-v4-${id}${suffix}.webp`] ??
    outfitImages[`../assets/wardrobe-v3-${id}${suffix}.webp`];
  if (!src) throw new Error(`衣装素材缺失: ${id}/${expression}`);
  return {
    src,
    count: expression < 6 ? 3 : 2,
    cell:
      expression < 3
        ? expression
        : expression < 6
          ? expression - 3
          : expression - 6,
  };
}
export function outfitCG(id: OutfitId) {
  const src = outfitCGs[`../assets/outfit-cg-v3-${id}.webp`];
  if (!src) throw new Error(`番外CG缺失: ${id}`);
  return src;
}
export const ART = { proud, shy, casting, gala, hall, spells };
export const CG = [cg0, cg1, cg2, cg3, cg4, cg5];
export const CG_NAMES = [
  "棋厅重逢",
  "雪中约定",
  "共读一局",
  "圣诞心事",
  "炉边私语",
  "并肩的未来",
];
export function characterArt(
  taps: number,
  frame?: number,
  outfit: "college" | "gala" = "college",
) {
  if (outfit === "gala") return gala;
  if (frame === 4) return casting;
  return taps > 0 || [1, 2, 3, 7].includes(frame ?? -1) ? shy : proud;
}
export function spellArtStyle(id: SpellId) {
  const index = SPELLS.findIndex((s) => s.id === id);
  return {
    backgroundImage: `url(${spells})`,
    backgroundPosition: `${((index % 6) / 5) * 100}% ${(Math.floor(index / 6) / 3) * 100}%`,
  };
}
