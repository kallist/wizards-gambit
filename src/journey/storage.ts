import type { PlayerStorage } from "../platform/playerStorage";
import {
  decodeJourneyProgress,
  initialJourneyProgress,
  reduceJourney,
  type JourneyCommand,
  type JourneyProgress,
} from "./model";

export const JOURNEY_KEY = "wizards-gambit-journey-v1";

export function readJourney(storage: PlayerStorage): JourneyProgress {
  const raw = storage.getItem(JOURNEY_KEY);
  if (raw === null) return initialJourneyProgress();
  if (new TextEncoder().encode(raw).length > 300_000)
    throw new Error("棋旅记录过大，原件已保留，请先导出备份");
  return decodeJourneyProgress(JSON.parse(raw));
}

/** One lock and one value commit the board, retry and memory together. */
export async function commitJourney(
  storage: PlayerStorage,
  expectedRevision: number,
  command: JourneyCommand,
  active: () => boolean,
): Promise<{ kind: "saved" | "stale"; progress: JourneyProgress } | null> {
  const write = () => {
    if (!active()) return null;
    const previous = readJourney(storage);
    if (previous.revision !== expectedRevision)
      return { kind: "stale" as const, progress: previous };
    const next = decodeJourneyProgress(reduceJourney(previous, command));
    const text = JSON.stringify(next);
    if (new TextEncoder().encode(text).length > 300_000)
      throw new Error("棋旅记录已满，请先导出备份；本次操作未保存");
    storage.setItem(JOURNEY_KEY, text);
    if (storage.getItem(JOURNEY_KEY) !== text)
      throw new Error("棋旅保存尚未确认，请重新读取后再试");
    return { kind: "saved" as const, progress: next };
  };
  if (storage.scope === "temporary") return write();
  if (typeof navigator === "undefined" || !navigator.locks)
    throw new Error("缺少安全存档锁，请从存档入口重新进入临时会话");
  return navigator.locks.request(`wizard-journey:${storage.scope}`, write);
}
