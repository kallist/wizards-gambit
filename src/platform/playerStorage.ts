export const PLAYER_KEYS = {
  progress: "wizards-gambit-progress-v1",
  companion: "wizards-gambit-companion-v1",
  dates: "wizards-gambit-dates-v1",
  settings: "wizards-gambit-settings-v1",
  session: "wizards-gambit-session-v1",
  journey: "wizards-gambit-journey-v1",
} as const;
export const PLAYER_CHANGE = "wizard-player-save-change";
let activeScope = "local";
// One JS realm owns this map: unsupported lock environments never share writes.
let temporaryValues = new Map<string, string>();
/** A new handle owns a fresh page-private session; late old callbacks stay isolated. */
export function createTemporaryStorage(): PlayerStorage {
  temporaryValues = new Map();
  return getPlayerStorage("temporary");
}
export function selectPlayerScope(scope: string) {
  if (
    !["local", "guest", "temporary"].includes(scope) &&
    !/^[a-f0-9]{64}$/.test(scope)
  )
    throw new Error("存档账号无效");
  activeScope = scope;
}
export interface PlayerStorage {
  readonly scope: string;
  readonly prefix: string;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  removeMeta(key: string): void;
  physicalKey(key: string): string;
}
/** Capture a scope once; old asynchronous callbacks cannot write to a new account. */
export function getPlayerStorage(scope = activeScope): PlayerStorage {
  const values = temporaryValues;
  const backing =
    scope === "temporary"
      ? {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => {
            values.set(key, value);
          },
          removeItem: (key: string) => {
            values.delete(key);
          },
        }
      : {
          getItem: (key: string) => localStorage.getItem(key),
          setItem: (key: string, value: string) =>
            localStorage.setItem(key, value),
          removeItem: (key: string) => localStorage.removeItem(key),
        };
  const prefix = scope === "local" ? "" : `wg-player-v2-${scope}:`;
  const physicalKey = (key: string) => prefix + key;
  const metaKey = (key: string) => `${prefix}wg-save-meta-${key}`;
  const notify = () => {
    if (typeof window !== "undefined" && window.dispatchEvent)
      window.dispatchEvent(
        new CustomEvent(PLAYER_CHANGE, { detail: { scope } }),
      );
  };
  const mark = () => {
    // Mark first: an interrupted save cannot silently lose the need to retry.
    backing.setItem(metaKey("dirty"), "1");
    const old = Number(backing.getItem(metaKey("changed"))) || 0;
    backing.setItem(metaKey("changed"), String(Math.max(Date.now(), old + 1)));
  };
  return {
    scope,
    prefix,
    physicalKey,
    getItem: (key) => backing.getItem(physicalKey(key)),
    setItem: (key, value) => {
      if (backing.getItem(physicalKey(key)) === value) return;
      const personal = Object.values(PLAYER_KEYS).some((k) => k === key);
      if (personal) mark();
      backing.setItem(physicalKey(key), value);
      if (personal) notify();
    },
    removeItem: (key) => {
      if (backing.getItem(physicalKey(key)) === null) return;
      const personal = Object.values(PLAYER_KEYS).some((k) => k === key);
      if (personal) mark();
      backing.removeItem(physicalKey(key));
      if (personal) notify();
    },
    getMeta: (key) => backing.getItem(metaKey(key)),
    setMeta: (key, value) => backing.setItem(metaKey(key), value),
    removeMeta: (key) => backing.removeItem(metaKey(key)),
  };
}
