import { useId } from "react";
import { outfitArt } from "./art";
import { OUTFIT_CLIP_PATHS, OUTFIT_VISIBLE_FRAMES } from "./outfitBounds";
import {
  EXPRESSION_NAMES,
  outfitById,
  type Expression,
  type OutfitId,
} from "../story/companion";
export function OutfitSprite({
  outfit,
  expression = 0,
  className = "",
  lazy = false,
  align = "center",
}: {
  outfit: OutfitId;
  expression?: Expression;
  className?: string;
  lazy?: boolean;
  align?: "center" | "top";
}) {
  const art = outfitArt(outfit, expression);
  const clipId = useId();
  const [x, y, width, height, cellWidth, cellHeight] =
    OUTFIT_VISIBLE_FRAMES[outfit][expression];
  const label = `成年马尔福 · ${outfitById(outfit).name} · ${EXPRESSION_NAMES[expression]}`;
  return (
    <span
      className={`outfit-sprite ${className}`}
      data-testid="outfit-sprite"
      data-outfit={outfit}
      data-expression={expression}
      role="img"
      aria-label={label}
    >
      <svg
        className="outfit-art"
        viewBox={`${x + art.cell * cellWidth} ${y} ${width} ${height}`}
        preserveAspectRatio={
          align === "top" ? "xMidYMin meet" : "xMidYMid meet"
        }
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId}>
            <path d={OUTFIT_CLIP_PATHS[outfit][expression]} />
          </clipPath>
        </defs>
        <image
          href={art.src}
          width={art.count * cellWidth}
          height={cellHeight}
          clipPath={`url(#${clipId})`}
        />
      </svg>
      <img
        className="outfit-source"
        src={art.src}
        alt=""
        aria-hidden="true"
        loading={lazy ? "lazy" : "eager"}
        draggable={false}
      />
    </span>
  );
}
