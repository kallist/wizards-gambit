import { validCompanionCloud, type CompanionCloud } from "../story/companion";
import {
  getPlayerStorage,
  PLAYER_KEYS,
  type PlayerStorage,
} from "./playerStorage";
export interface RankEntry {
  rank: number;
  score: number;
  nickname: string;
  avatar: string;
}
export interface ToySDK {
  isSupport(name: string): Promise<boolean>;
  submitScore(options: {
    board: number;
    score: number;
  }): Promise<{ score: number }>;
  getRankList(options: {
    board: number;
    period: "all";
    limit: number;
  }): Promise<RankEntry[]>;
  getMyRank(options: {
    board: number;
    period: "all";
  }): Promise<{ ranked: boolean; rank: number; score: number }>;
  getUserProfile?(): Promise<{
    avatar: string;
    nickname: string;
    toyOpenId?: string;
  }>;
  getCloudStorage(keys?: string[]): Promise<Record<string, string>>;
  setCloudStorage(items: Record<string, string>): Promise<void>;
  removeCloudStorage?(keys: string[]): Promise<void>;
}
declare global {
  interface Window {
    toy?: ToySDK;
  }
}
let loading: Promise<ToySDK> | null = null;
export const isToyHost = () =>
  !!window.toy || import.meta.env.VITE_TOY_ENABLED === "true";

export function toyError(error: unknown): string {
  const e = error as { type?: string; code?: number };
  if (e?.type === "not_logged_in")
    return "请先在哔哩哔哩登录，再提交云端成绩。";
  if (e?.code === 307044) return "云端请求较多，请稍后手动重试。";
  if (e?.type === "timeout") return "Toy 容器连接超时，请稍后重试。";
  if (e?.type === "unsupported") return "当前容器暂不支持这项 Toy 能力。";
  return "云端暂时未连接，请稍后重试。";
}
export function loadToy(): Promise<ToySDK> {
  if (!isToyHost())
    return Promise.reject(new Error("当前是本地浏览器，不是 Toy 容器"));
  if (window.toy) return Promise.resolve(window.toy);
  if (!loading)
    loading = new Promise<ToySDK>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js";
      script.async = true;
      const timer = setTimeout(() => {
        loading = null;
        reject(new Error("Toy SDK 载入超时"));
      }, 12000);
      script.onload = () => {
        clearTimeout(timer);
        if (window.toy) resolve(window.toy);
        else {
          loading = null;
          reject(new Error("Toy SDK 不可用"));
        }
      };
      script.onerror = () => {
        clearTimeout(timer);
        loading = null;
        reject(new Error("Toy SDK 载入失败"));
      };
      document.head.append(script);
    });
  return loading;
}
export async function fetchRanks(): Promise<RankEntry[]> {
  return (await loadToy()).getRankList({ board: 1, period: "all", limit: 30 });
}
export async function submitTrial(score: number): Promise<number> {
  if (!Number.isInteger(score) || score < 0 || score > 16777215)
    throw new Error("成绩无效");
  return (await (await loadToy()).submitScore({ board: 1, score })).score;
}
export interface Progress {
  schema: 1;
  unlocked: number;
  chapter: number;
  taps: number;
  best: number;
  companion?: CompanionCloud;
}
const KEY = PLAYER_KEYS.progress;
const initial: Progress = {
  schema: 1,
  unlocked: 1,
  chapter: 0,
  taps: 0,
  best: 0,
};
export function readProgress(
  storage: Pick<Storage, "getItem"> = getPlayerStorage(),
): Progress {
  try {
    const x = JSON.parse(storage.getItem(KEY) ?? "null");
    if (
      x?.schema === 1 &&
      [x.unlocked, x.chapter, x.taps, x.best].every(Number.isFinite)
    )
      return {
        schema: 1,
        unlocked: Math.max(1, Math.min(6, Math.floor(x.unlocked))),
        chapter: Math.max(0, Math.min(5, Math.floor(x.chapter))),
        taps: Math.max(0, Math.min(100000, Math.floor(x.taps))),
        best: Math.max(0, Math.min(16777215, Math.floor(x.best))),
        ...(validCompanionCloud(x.companion)
          ? {
              companion: { owned: x.companion.owned, heart: x.companion.heart },
            }
          : {}),
      };
  } catch {
    /* Corrupt local saves safely fall back. */
  }
  return { ...initial };
}
export function saveProgress(
  p: Progress,
  storage: Pick<Storage, "setItem"> = getPlayerStorage(),
) {
  try {
    storage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
/** Normal progress is monotonic; explicit backup adoption keeps its own path. */
export function mergeProgress(next: Progress, stored: Progress): Progress {
  return {
    ...next,
    unlocked: Math.max(next.unlocked, stored.unlocked),
    chapter: stored.unlocked > next.unlocked ? stored.chapter : next.chapter,
    taps: Math.max(next.taps, stored.taps),
    best: Math.max(next.best, stored.best),
    ...(next.companion || stored.companion
      ? {
          companion: {
            owned:
              (next.companion?.owned ?? 3) | (stored.companion?.owned ?? 3),
            heart: Math.max(
              next.companion?.heart ?? 0,
              stored.companion?.heart ?? 0,
            ),
          },
        }
      : {}),
  };
}
export async function persistProgress(
  next: Progress,
  storage: PlayerStorage,
  active: () => boolean,
): Promise<Progress | null> {
  const write = () => {
    if (!active()) return null;
    const raw = storage.getItem(KEY);
    if (raw !== null) {
      const value = JSON.parse(raw);
      if (
        !value ||
        value.schema !== 1 ||
        ![
          [value.unlocked, 1, 6],
          [value.chapter, 0, 5],
          [value.taps, 0, 100000],
          [value.best, 0, 16777215],
        ].every(
          ([v, min, max]) => Number.isInteger(v) && v >= min && v <= max,
        ) ||
        (value.companion !== undefined && !validCompanionCloud(value.companion))
      )
        throw new Error("本机进度异常，已保留原件");
    }
    const merged = mergeProgress(next, readProgress(storage));
    if (!saveProgress(merged, storage)) throw new Error("本机进度未能保存");
    return merged;
  };
  if (storage.scope === "temporary") return write();
  if (!navigator.locks) throw new Error("当前入口缺少安全存档锁");
  return navigator.locks.request(`wizard-progress:${storage.scope}`, write);
}
let legacyWrites: Promise<unknown> = Promise.resolve();
/** Legacy adapter only; v8 account backups use immutable cloud commits. */
export function syncProgress(p: Progress) {
  const write = async () => {
    const old = await getCloudProgress();
    const next: Progress = old
      ? {
          ...p,
          unlocked: Math.max(p.unlocked, old.unlocked),
          chapter: old.unlocked > p.unlocked ? old.chapter : p.chapter,
          taps: Math.max(p.taps, old.taps),
          best: Math.max(p.best, old.best),
          ...(old.companion || p.companion
            ? {
                companion: {
                  owned:
                    (old.companion?.owned ?? 3) | (p.companion?.owned ?? 3),
                  heart: Math.max(
                    old.companion?.heart ?? 0,
                    p.companion?.heart ?? 0,
                  ),
                },
              }
            : {}),
        }
      : p;
    const value = JSON.stringify(next);
    if (new TextEncoder().encode(value).length > 1024)
      throw new Error("剧情存档体积超限");
    await (await loadToy()).setCloudStorage({ progress_v1: value });
  };
  const task = legacyWrites.then(write, write);
  legacyWrites = task.catch(() => undefined);
  return task;
}
export async function getCloudProgress(): Promise<Progress | null> {
  const data = await (await loadToy()).getCloudStorage(["progress_v1"]);
  if (!data.progress_v1) return null;
  const p = JSON.parse(data.progress_v1) as Progress;
  if (
    !p ||
    p.schema !== 1 ||
    ![p.unlocked, p.chapter, p.taps, p.best].every(Number.isInteger) ||
    p.unlocked < 1 ||
    p.unlocked > 6 ||
    p.chapter < 0 ||
    p.chapter > 5 ||
    p.taps < 0 ||
    p.taps > 100000 ||
    p.best < 0 ||
    p.best > 16777215 ||
    (p.companion !== undefined && !validCompanionCloud(p.companion))
  )
    throw new Error("云端存档格式无效");
  return p;
}
