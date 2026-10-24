import mirror from "../assets/enchanted-mirror-v5.webp";
import { OutfitSprite } from "./OutfitSprite";
import type { Expression, OutfitId } from "../story/companion";

/** The painted prop stays behind the character; the glass never covers her. */
export function EnchantedMirror({
  outfit,
  expression,
}: {
  outfit: OutfitId;
  expression: Expression;
}) {
  return (
    <span
      className="enchanted-mirror"
      data-testid="full-length-mirror"
      style={{ backgroundImage: `url(${mirror})` }}
    >
      <span className="enchanted-reflection">
        <OutfitSprite outfit={outfit} expression={expression} />
      </span>
    </span>
  );
}
