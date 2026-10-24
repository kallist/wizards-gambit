import { validateSavedGame } from "../domain/engine";
import type { GameState, Color } from "../domain/types";
import {
  OUTFITS,
  decodeCompanion,
  initialCompanion,
  validCompanionCloud,
  type CompanionProgress,
  type OutfitId,
  validMatchId,
} from "../story/companion";
import type { DateReading } from "../story/outfitStories";
import { readProgress, type Progress } from "./toy";
import { PLAYER_KEYS, type PlayerStorage } from "./playerStorage";
import {
  decodeJourneyProgress,
  initialJourneyProgress,
  mergeJourneyProgress,
  type JourneyProgress,
} from "../journey/model";

export const MAX_SAVE_BYTES = 1_300_000;
export interface SavedSession {
  matchId?: string;
  mode: "story" | "ai" | "local" | "trial";
  state: GameState;
  chapter: number;
  human: Color;
  difficulty: "gentle" | "normal" | "clever";
}
export interface PlayerSettings {
  view?: "2d" | "3d";
  comfort?: boolean;
  outfit?: OutfitId;
  musicVolume?: number;
}
export type SavedDates = Partial<
  Record<OutfitId, DateReading & { updatedAt?: number }>
>;
export interface PlayerSave {
  schema: 3;
  savedAt: number;
  progress: Progress;
  companion: CompanionProgress;
  dates: SavedDates;
  settings: PlayerSettings;
  session: SavedSession | null;
  journey: JourneyProgress;
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
export function validProgress(x: unknown): x is Progress {
  if (!object(x)) return false;
  return (
    x.schema === 1 &&
    [
      [x.unlocked, 1, 6],
      [x.chapter, 0, 5],
      [x.taps, 0, 100000],
      [x.best, 0, 16777215],
    ].every(
      ([v, min, max]) =>
        Number.isInteger(v) &&
        Number(v) >= Number(min) &&
        Number(v) <= Number(max),
    )
  );
}
export function validSession(x: unknown): x is SavedSession {
  return (
    object(x) &&
    ["story", "ai", "local", "trial"].includes(String(x.mode)) &&
    validateSavedGame(x.state) &&
    Number.isInteger(x.chapter) &&
    Number(x.chapter) >= 0 &&
    Number(x.chapter) < 6 &&
    ["white", "black"].includes(String(x.human)) &&
    ["gentle", "normal", "clever"].includes(String(x.difficulty)) &&
    (x.matchId === undefined || validMatchId(x.matchId))
  );
}
function validSettings(x: unknown): x is PlayerSettings {
  return (
    object(x) &&
    Object.keys(x).every((key) =>
      ["view", "comfort", "outfit", "musicVolume"].includes(key),
    ) &&
    (x.view === undefined || ["2d", "3d"].includes(String(x.view))) &&
    (x.comfort === undefined || typeof x.comfort === "boolean") &&
    (x.outfit === undefined || OUTFITS.some((o) => o.id === x.outfit)) &&
    (x.musicVolume === undefined ||
      (typeof x.musicVolume === "number" &&
        Number.isFinite(x.musicVolume) &&
        x.musicVolume >= 0 &&
        x.musicVolume <= 1))
  );
}
export function validDates(x: unknown): x is SavedDates {
  return (
    object(x) &&
    Object.keys(x).length <= OUTFITS.length &&
    Object.entries(x).every(
      ([id, record]) =>
        OUTFITS.some((o) => o.id === id) &&
        object(record) &&
        Number.isInteger(record.line) &&
        Number(record.line) >= 0 &&
        Number(record.line) < 24 &&
        Array.isArray(record.choices) &&
        record.choices.length === 2 &&
        record.choices.every((c) => c === null || c === 0 || c === 1) &&
        !(Number(record.line) > 5 && record.choices[0] === null) &&
        !(Number(record.line) > 17 && record.choices[1] === null) &&
        (record.updatedAt === undefined ||
          (Number.isSafeInteger(record.updatedAt) &&
            Number(record.updatedAt) >= 0)),
    )
  );
}
export function decodePlayerSave(value: unknown): PlayerSave {
  if (
    !object(value) ||
    (value.schema !== 2 && value.schema !== 3) ||
    !Number.isSafeInteger(value.savedAt) ||
    Number(value.savedAt) < 0 ||
    !validProgress(value.progress) ||
    !decodeCompanion(value.companion) ||
    !validDates(value.dates) ||
    !validSettings(value.settings) ||
    (value.session !== null && !validSession(value.session))
  )
    throw new Error("备份数据无效，原存档未更改");
  // Only the allowlist is adopted: never import credentials or arbitrary storage keys.
  const p = value.progress;
  const dates = Object.fromEntries(
    Object.entries(value.dates).map(([id, d]) => [
      id,
      {
        line: d.line,
        choices: d.choices,
        ...(d.updatedAt === undefined ? {} : { updatedAt: d.updatedAt }),
      },
    ]),
  );
  const session = value.session as SavedSession | null;
  const journey =
    value.schema === 2
      ? initialJourneyProgress()
      : decodeJourneyProgress(value.journey);
  return structuredClone({
    schema: 3,
    savedAt: value.savedAt,
    progress: {
      schema: 1,
      unlocked: p.unlocked,
      chapter: p.chapter,
      taps: p.taps,
      best: p.best,
    },
    companion: decodeCompanion(value.companion)!,
    dates,
    settings: value.settings,
    session: session && {
      ...(session.matchId === undefined ? {} : { matchId: session.matchId }),
      mode: session.mode,
      chapter: session.chapter,
      human: session.human,
      difficulty: session.difficulty,
      state: cleanGame(session.state),
    },
    journey,
  }) as PlayerSave;
}
// Explicit nested projection prevents foreign properties from travelling with a backup.
function cleanGame(s: GameState): GameState {
  const piece = (p: NonNullable<GameState["board"][number]>) => ({
    id: p.id,
    color: p.color,
    kind: p.kind,
    origin: p.origin,
    moved: p.moved,
    effects: p.effects.map((e) => ({
      type: e.type,
      until: e.until,
      source: e.source,
    })),
  });
  const cards = (c: Color) =>
    s.hands[c].map((x) => ({ id: x.id, spell: x.spell, readyPly: x.readyPly }));
  return {
    schema: 1,
    board: s.board.map((p) => p && piece(p)),
    turn: s.turn,
    ply: s.ply,
    version: s.version,
    phase: s.phase,
    rules: s.rules,
    rng: s.rng,
    cardSerial: s.cardSerial,
    hands: { white: cards("white"), black: cards("black") },
    revealed: { white: s.revealed.white, black: s.revealed.black },
    tiles: s.tiles.map((t) => ({
      square: t.square,
      type: t.type,
      until: t.until,
      owner: t.owner,
    })),
    grave: s.grave.map((g) => ({ piece: piece(g.piece), square: g.square })),
    rewarded: s.rewarded,
    ep: s.ep && {
      square: s.ep.square,
      pawnSquare: s.ep.pawnSquare,
      pawnId: s.ep.pawnId,
    },
    halfmove: s.halfmove,
    repetitions: s.repetitions,
    history: s.history.map(
      (h) =>
        Object.fromEntries(
          Object.entries(h).filter(([k]) =>
            [
              "ply",
              "color",
              "type",
              "text",
              "from",
              "to",
              "captured",
              "capturedId",
              "spell",
            ].includes(k),
          ),
        ) as unknown as GameState["history"][number],
    ),
    result: s.result && { winner: s.result.winner, reason: s.result.reason },
  };
}
export function capturePlayerSave(storage: PlayerStorage): PlayerSave {
  const parse = (key: string, absent: unknown) => {
    const raw = storage.getItem(key);
    if (raw === null) return absent;
    if (new TextEncoder().encode(raw).length > MAX_SAVE_BYTES)
      throw new Error("本机存档过大，请先导出备份");
    return JSON.parse(raw);
  };
  const progressRaw = parse(PLAYER_KEYS.progress, null);
  // Corrupt existing data must not be replaced by the UI's initial fallback.
  if (
    storage.getItem(PLAYER_KEYS.progress) !== null &&
    (!validProgress(progressRaw) ||
      (progressRaw.companion !== undefined &&
        !validCompanionCloud(progressRaw.companion)))
  )
    throw new Error("本机进度异常，已停止云写入");
  const progress = progressRaw ?? readProgress(storage);
  const defaultCompanion = initialCompanion(progress.taps);
  if (validCompanionCloud(progress.companion)) {
    defaultCompanion.owned |= progress.companion.owned;
    defaultCompanion.heart = Math.max(
      defaultCompanion.heart,
      progress.companion.heart,
    );
  }
  return decodePlayerSave({
    schema: 3,
    savedAt:
      Number(storage.getMeta("changed")) ||
      (Object.values(PLAYER_KEYS).some((key) => storage.getItem(key) !== null)
        ? Date.now()
        : 0),
    progress,
    companion: parse(PLAYER_KEYS.companion, defaultCompanion),
    dates: parse(PLAYER_KEYS.dates, {}),
    settings: parse(PLAYER_KEYS.settings, {}),
    session: parse(PLAYER_KEYS.session, null),
    journey: parse(PLAYER_KEYS.journey, initialJourneyProgress()),
  });
}
export function mergePlayerSaves(
  local: PlayerSave,
  incoming: PlayerSave,
): PlayerSave {
  const a = local.progress,
    b = incoming.progress;
  const dates: SavedDates = { ...incoming.dates };
  for (const outfit of OUTFITS) {
    const x = local.dates[outfit.id],
      y = incoming.dates[outfit.id];
    if (
      x &&
      (!y ||
        (x.updatedAt ?? local.savedAt) >= (y.updatedAt ?? incoming.savedAt))
    )
      dates[outfit.id] = x;
  }
  const claimed = [
    ...new Set([...local.companion.claimed, ...incoming.companion.claimed]),
  ].sort();
  return decodePlayerSave({
    schema: 3,
    savedAt: Math.max(local.savedAt, incoming.savedAt),
    progress: {
      schema: 1,
      unlocked: Math.max(a.unlocked, b.unlocked),
      chapter: local.savedAt >= incoming.savedAt ? a.chapter : b.chapter,
      taps: Math.max(a.taps, b.taps),
      best: Math.max(a.best, b.best),
    },
    companion: {
      schema: 1,
      owned: local.companion.owned | incoming.companion.owned,
      heart: Math.max(local.companion.heart, incoming.companion.heart),
      claimed,
    },
    dates,
    settings: { ...incoming.settings, ...local.settings },
    session: local.session ?? incoming.session,
    journey: mergeJourneyProgress(local.journey, incoming.journey),
  });
}
export function withCore(save: PlayerSave, progress: Progress): PlayerSave {
  const c = progress.companion;
  return decodePlayerSave({
    ...save,
    progress: {
      ...save.progress,
      unlocked: Math.max(save.progress.unlocked, progress.unlocked),
      chapter:
        progress.unlocked > save.progress.unlocked
          ? progress.chapter
          : save.progress.chapter,
      taps: Math.max(save.progress.taps, progress.taps),
      best: Math.max(save.progress.best, progress.best),
    },
    companion: {
      ...save.companion,
      owned: save.companion.owned | (c?.owned ?? 3),
      heart: Math.max(save.companion.heart, c?.heart ?? 0),
    },
  });
}
export function writePlayerSave(storage: PlayerStorage, save: PlayerSave) {
  const data = decodePlayerSave(save);
  // Write-ahead recovery is idempotent if the browser stops between local keys.
  storage.setMeta("restore", JSON.stringify(data));
  for (const [key, value] of [
    [PLAYER_KEYS.progress, data.progress],
    [PLAYER_KEYS.companion, data.companion],
    [PLAYER_KEYS.dates, data.dates],
    [PLAYER_KEYS.settings, data.settings],
    [PLAYER_KEYS.session, data.session],
    [PLAYER_KEYS.journey, data.journey],
  ] as const) {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  }
  storage.removeMeta("restore");
}
/** An explicit rollback is a new reading decision, even when it restores page 0. */
export function renewReadingIntent(
  save: PlayerSave,
  now = Date.now(),
): PlayerSave {
  return decodePlayerSave({
    ...save,
    savedAt: now,
    dates: Object.fromEntries(
      Object.entries(save.dates).map(([id, d]) => [
        id,
        { ...d, updatedAt: now },
      ]),
    ),
  });
}
export function recoverLocalRestore(storage: PlayerStorage) {
  const pending = storage.getMeta("restore");
  if (pending) writePlayerSave(storage, decodePlayerSave(JSON.parse(pending)));
}
export function backupFile(save: PlayerSave) {
  const text = JSON.stringify(
    {
      format: "wizard-chess-player-backup",
      version: 2,
      save: decodePlayerSave(save),
    },
    null,
    2,
  );
  if (new TextEncoder().encode(text).length > MAX_SAVE_BYTES)
    throw new Error("备份文件过大");
  return text;
}
export function parseBackupFile(text: string) {
  if (new TextEncoder().encode(text).length > MAX_SAVE_BYTES)
    throw new Error("备份文件过大");
  const file = JSON.parse(text);
  if (file?.format !== "wizard-chess-player-backup" || file?.version !== 2)
    throw new Error("不是本游戏的有效备份");
  return decodePlayerSave(file.save);
}
