import {
  awardOutfit,
  decodeCompanion,
  initialCompanion,
  mergeCompanion,
  type CompanionCloud,
  type CompanionProgress,
} from "../story/companion";
import { getPlayerStorage, type PlayerStorage } from "./playerStorage";

export const COMPANION_KEY = "wizards-gambit-companion-v1";
export function newMatchId() {
  // HTTP LAN pages may expose getRandomValues without the secure-context UUID API.
  const id =
    crypto.randomUUID?.() ??
    Array.from(crypto.getRandomValues(new Uint32Array(4)), (word) =>
      word.toString(16).padStart(8, "0"),
    ).join("");
  return `local:${id}`;
}
type StoragePort = Pick<Storage, "getItem" | "setItem">;
function readStored(
  legacyTaps: number,
  storage: StoragePort,
): CompanionProgress {
  const raw = storage.getItem(COMPANION_KEY);
  if (!raw) return initialCompanion(legacyTaps);
  if (raw.length >= 120000) throw new Error("衣柜存档体积无效");
  const decoded = decodeCompanion(JSON.parse(raw));
  if (!decoded) throw new Error("衣柜存档格式无效");
  return decoded;
}
export function readCompanion(
  legacyTaps = 0,
  storage?: StoragePort,
): CompanionProgress {
  try {
    return readStored(legacyTaps, storage ?? getPlayerStorage());
  } catch {
    /* Invalid or unavailable persistence never enters the model. */
  }
  return initialCompanion(legacyTaps);
}
let queue: Promise<unknown> = Promise.resolve();
async function mutate<T>(
  operation: (p: CompanionProgress) => {
    progress: CompanionProgress;
    value: T;
  },
  legacyTaps = 0,
  storage?: StoragePort,
) {
  const accountStorage =
    storage && "scope" in storage
      ? (storage as PlayerStorage)
      : getPlayerStorage();
  const port = storage ?? accountStorage;
  const task = async () => {
    // Read failures/corruption must not overwrite an existing collection with
    // a fallback shown by the UI. Only an absent save starts a new ledger.
    const previous = readStored(legacyTaps, port);
    const result = operation(previous);
    if (result.progress !== previous)
      port.setItem(COMPANION_KEY, JSON.stringify(result.progress));
    return { state: result.progress, value: result.value };
  };
  if (
    (!storage || "scope" in storage) &&
    typeof navigator !== "undefined" &&
    navigator.locks
  )
    return navigator.locks.request(
      `wizards-gambit-companion:${accountStorage.scope}`,
      task,
    );
  const promise = queue.then(task, task);
  queue = promise.catch(() => undefined);
  return promise;
}
function randomIndex(count: number) {
  const limit = Math.floor(0x100000000 / count) * count,
    array = new Uint32Array(1);
  do {
    crypto.getRandomValues(array);
  } while (array[0] >= limit);
  return array[0] % count;
}
export function claimOutfit(
  matchId: string,
  legacyTaps = 0,
  storage?: StoragePort,
  choose = randomIndex,
) {
  return mutate(
    (p) => {
      const result = awardOutfit(p, matchId, choose);
      return {
        progress: result.progress,
        value: { outfit: result.outfit, status: result.status },
      };
    },
    legacyTaps,
    storage,
  );
}
export function addHeart(legacyTaps = 0, storage?: StoragePort) {
  return mutate(
    (p) => ({
      progress: { ...p, heart: Math.min(100, p.heart + 1) },
      value: null,
    }),
    legacyTaps,
    storage,
  );
}
export function restoreCompanion(
  cloud: CompanionCloud,
  legacyTaps = 0,
  storage?: StoragePort,
) {
  return mutate(
    (p) => ({ progress: mergeCompanion(p, cloud), value: null }),
    legacyTaps,
    storage,
  );
}
