import { applyAction, legalMoves } from "../../src/domain/engine";
import type { Action, GameState } from "../../src/domain/types";
/** A bounded chess-only strategy checks every legal black reply, not a weak AI. */
export function forcingMove(state: GameState, left = 2): Action | null {
  if (!left || state.result) return null;
  // Take a mate now before considering a fresh two-turn plan; otherwise a
  // receding horizon can keep postponing a finish that is already available.
  for (const move of legalMoves(state)) {
    const after = applyAction(state, { type: "move", move });
    if (after.result?.winner === "white" && after.result.reason === "checkmate")
      return { type: "move", move };
  }
  for (const move of legalMoves(state)) {
    const after = applyAction(state, { type: "move", move });
    if (after.result?.winner === "white" && after.result.reason === "checkmate")
      return { type: "move", move };
    if (left > 1 && !after.result) {
      const replies = legalMoves(after);
      if (
        replies.length &&
        replies.every(
          (reply) =>
            !!forcingMove(
              applyAction(after, { type: "move", move: reply }),
              left - 1,
            ),
        )
      )
        return { type: "move", move };
    }
  }
  return null;
}
