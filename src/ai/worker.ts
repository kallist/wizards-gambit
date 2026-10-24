import { chooseAction } from "./search";
import type { Difficulty } from "./search";
import type { GameState } from "../domain/types";
self.onmessage = (
  event: MessageEvent<{
    id: number;
    state: GameState;
    difficulty: Difficulty;
    deterministic?: boolean;
  }>,
) => {
  try {
    self.postMessage({
      id: event.data.id,
      action: chooseAction(
        event.data.state,
        event.data.difficulty,
        event.data.deterministic,
      ),
    });
  } catch {
    self.postMessage({ id: event.data.id, error: "电脑思考失败，请重试" });
  }
};
