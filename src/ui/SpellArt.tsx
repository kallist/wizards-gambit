import type { SpellId } from "../domain/types";
import { spellArtStyle } from "./art";
export function SpellArt({ spell }: { spell: SpellId }) {
  return (
    <span
      className="spell-illustration"
      style={spellArtStyle(spell)}
      aria-hidden="true"
    />
  );
}
