import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGame, applyAction } from "../src/domain/engine";
import { decodeCompanion } from "../src/story/companion";
import { readDate, saveDate } from "../src/story/outfitStories";
import {
  AccountChangedError,
  CloudSnapshots,
  bounded,
  toyOwner,
} from "../src/platform/cloudSnapshots";
import {
  getPlayerStorage,
  PLAYER_KEYS,
  selectPlayerScope,
} from "../src/platform/playerStorage";
import {
  backupFile,
  capturePlayerSave,
  decodePlayerSave,
  mergePlayerSaves,
  parseBackupFile,
  recoverLocalRestore,
  writePlayerSave,
  renewReadingIntent,
} from "../src/platform/saveModel";
import { syncProgress, type ToySDK } from "../src/platform/toy";
import { SaveManager } from "../src/platform/SaveManager";

const owner = "a".repeat(64),
  other = "b".repeat(64),
  deviceA = "1".repeat(32),
  deviceB = "2".repeat(32);
let local: Map<string, string>;
function mockCloud() {
  const values: Record<string, string> = {};
  const sdk = {
    getUserProfile: vi.fn(async () => ({
      toyOpenId: "isolated-test-user",
      nickname: "测试",
      avatar: "",
    })),
    getCloudStorage: vi.fn(async (keys?: string[]) =>
      Object.fromEntries(
        Object.entries(values).filter(
          ([k]) => !keys?.length || keys.includes(k),
        ),
      ),
    ),
    setCloudStorage: vi.fn(async (items: Record<string, string>) => {
      expect(Object.keys({ ...values, ...items }).length).toBeLessThanOrEqual(
        128,
      );
      for (const [k, v] of Object.entries(items)) {
        expect(k).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
        expect(new TextEncoder().encode(v).length).toBeLessThanOrEqual(1024);
        values[k] = v;
      }
    }),
    removeCloudStorage: vi.fn(async (keys: string[]) => {
      for (const k of keys) delete values[k];
    }),
  } as unknown as ToySDK;
  const client = (device = deviceA, who = owner, verify = async () => {}) =>
    new CloudSnapshots(sdk, { owner: who, device, verify });
  return { values, sdk, client };
}
const fresh = () => capturePlayerSave(getPlayerStorage(owner));
const rich = () => {
  const save = fresh();
  save.savedAt = 1000;
  save.progress = { schema: 1, unlocked: 6, chapter: 5, taps: 80, best: 1300 };
  save.companion = {
    schema: 1,
    owned: 0xffffff,
    heart: 90,
    claimed: ["match:earned"],
  };
  save.settings = {
    view: "3d",
    comfort: true,
    outfit: "gala",
    musicVolume: 0.6,
  };
  save.dates = { college: { line: 20, choices: [1, 0], updatedAt: 900 } };
  save.session = {
    mode: "local",
    human: "white",
    difficulty: "gentle",
    chapter: 3,
    matchId: "local:saved",
    state: applyAction(createGame("classic", 123), {
      type: "move",
      move: { from: 52, to: 36 },
    }),
  };
  return save;
};
beforeEach(() => {
  local = new Map();
  selectPlayerScope("local");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => local.set(k, v),
    removeItem: (k: string) => local.delete(k),
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", {
    locks: {
      request: async (_name: string, task: () => Promise<unknown>) => task(),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("local player save and migration", () => {
  it("migrates compact legacy local ownership when no separate wardrobe exists", () => {
    local.set(
      PLAYER_KEYS.progress,
      JSON.stringify({
        ...rich().progress,
        companion: { owned: 0xffffff, heart: 90 },
      }),
    );
    expect(capturePlayerSave(getPlayerStorage("local")).companion).toEqual({
      schema: 1,
      owned: 0xffffff,
      heart: 90,
      claimed: [],
    });
  });
  it("captures account handles, leaves unowned legacy and room credentials out of files", () => {
    local.set(PLAYER_KEYS.progress, JSON.stringify(rich().progress));
    const a = getPlayerStorage(owner),
      b = getPlayerStorage(other);
    selectPlayerScope(other);
    a.setItem(PLAYER_KEYS.progress, JSON.stringify(rich().progress));
    a.setItem(
      "wizards-gambit-room-v1",
      JSON.stringify({ token: "private-room-token" }),
    );
    expect(capturePlayerSave(b).progress.unlocked).toBe(1);
    expect(capturePlayerSave(a).progress.unlocked).toBe(6);
    expect(local.get(PLAYER_KEYS.progress)).toContain("1300");
    const file = backupFile(capturePlayerSave(a));
    expect(file).not.toContain("private-room-token");
    expect(file).not.toContain(owner);
    expect(parseBackupFile(file)).toEqual(capturePlayerSave(a));
  });
  it("fails closed on an existing corrupt/null progress without changing originals", () => {
    for (const raw of [
      "null",
      "{bad",
      JSON.stringify({ schema: 1, unlocked: 99 }),
    ]) {
      local.set(PLAYER_KEYS.progress, raw);
      expect(() => capturePlayerSave(getPlayerStorage("local"))).toThrow();
      expect(local.get(PLAYER_KEYS.progress)).toBe(raw);
    }
  });
  it("keeps dirty marker if a local write fails", () => {
    const port = getPlayerStorage(owner),
      native = localStorage.setItem;
    localStorage.setItem = (k, v) => {
      if (k === port.physicalKey(PLAYER_KEYS.session)) throw Error("quota");
      native(k, v);
    };
    expect(() => port.setItem(PLAYER_KEYS.session, "{}")).toThrow("quota");
    expect(port.getMeta("dirty")).toBe("1");
  });
  it("replays an interrupted local restore idempotently", () => {
    const port = getPlayerStorage(owner),
      native = localStorage.setItem;
    let failed = false;
    localStorage.setItem = (k, v) => {
      if (!failed && k === port.physicalKey(PLAYER_KEYS.settings)) {
        failed = true;
        throw Error("quota");
      }
      native(k, v);
    };
    expect(() => writePlayerSave(port, rich())).toThrow("quota");
    expect(port.getMeta("restore")).toBeTruthy();
    recoverLocalRestore(port);
    recoverLocalRestore(port);
    const actual = capturePlayerSave(port);
    expect({ ...actual, savedAt: 1000 }).toEqual(rich());
    expect(port.getMeta("restore")).toBeNull();
  });
  it("roundtrips offline board, choices and settings; strips unknown nested properties", () => {
    const input = rich() as any;
    input.roomToken = "secret";
    input.session.token = "secret";
    input.session.state.token = "secret";
    input.session.state.board[0].token = "secret";
    input.dates.college.token = "secret";
    const text = backupFile(input);
    expect(text).not.toContain("secret");
    expect(parseBackupFile(text).session?.state.history).toHaveLength(1);
    expect(parseBackupFile(text).dates.college?.choices).toEqual([1, 0]);
    expect(() => parseBackupFile('{"format":"other"}')).toThrow();
    expect(() =>
      decodePlayerSave({
        ...rich(),
        session: { ...rich().session, mode: "online" },
      }),
    ).toThrow();
    expect(() =>
      decodePlayerSave({
        ...rich(),
        dates: { college: { line: 20, choices: [null, null] } },
      }),
    ).toThrow();
    expect(() => parseBackupFile("x".repeat(1_300_001))).toThrow("过大");
  });
  it("merges independent reading stamps, outfits and ledgers, keeping the active local game", () => {
    const a = rich(),
      b = rich();
    a.companion.owned = 7;
    b.companion.owned = 11;
    a.companion.claimed = ["match:device-a"];
    b.companion.claimed = ["match:device-b"];
    b.dates = {
      college: { line: 7, choices: [0, null], updatedAt: 901 },
      gala: { line: 3, choices: [null, null], updatedAt: 900 },
    };
    b.session!.state = createGame("magic", 99);
    const result = mergePlayerSaves(a, b);
    expect(result.companion.owned).toBe(15);
    expect(result.companion.claimed).toHaveLength(2);
    expect(result.dates.college?.line).toBe(7);
    expect(result.dates.gala?.line).toBe(3);
    expect(result.session).toEqual(a.session);
    expect(
      decodeCompanion({ ...a.companion, claimed: ["match:aaa", "match:bbb"] }),
    ).not.toBeNull();
    expect(
      decodeCompanion({
        ...a.companion,
        claimed: Array.from({ length: 1025 }, (_, i) => `match:${i}`),
      }),
    ).toBeNull();
  });
  it("does not drop other outfit timestamps when reading another story", () => {
    const port = getPlayerStorage(owner);
    saveDate("college", { line: 7, choices: [0, null] }, port);
    const stamp = JSON.parse(port.getItem(PLAYER_KEYS.dates)!).college
      .updatedAt;
    saveDate("gala", { line: 3, choices: [null, null] }, port);
    expect(JSON.parse(port.getItem(PLAYER_KEYS.dates)!).college.updatedAt).toBe(
      stamp,
    );
    expect(readDate("college", port).line).toBe(7);
  });
});
describe("Toy cloud save regressions — isolated SDK Mock, not real Toy", () => {
  it("explicit reading rollback stays selected after cloud sync and a fresh device restore", async () => {
    const c = mockCloud();
    await c.client().write(rich());
    const earlier = rich();
    earlier.dates.college = { line: 0, choices: [null, null], updatedAt: 1 };
    await c.client().write(renewReadingIntent(earlier));
    expect(
      (await c.client(deviceB).read(fresh())).save.dates.college?.line,
    ).toBe(0);
  });
  it("does not publish an invalid timestamp when a previous valid timestamp is at the integer bound", async () => {
    const c = mockCloud(),
      save = rich();
    save.savedAt = Number.MAX_SAFE_INTEGER;
    await c.client().write(save);
    await c.client().write(save);
    const result = await c.client().read(fresh());
    expect(result.candidates).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });
  it("never publishes the full manifest if chunk readback is incomplete", async () => {
    const c = mockCloud(),
      read = c.sdk.getCloudStorage;
    c.sdk.getCloudStorage = async (keys) =>
      keys?.some((k) => k.includes("_s_")) ? {} : read(keys);
    await expect(c.client().write(rich())).rejects.toThrow("未确认");
    expect(Object.keys(c.values).some((k) => k.includes("_m_"))).toBe(false);
  });
  it("account changes during a read cannot be adopted or followed by a write", async () => {
    const c = mockCloud();
    let switched = false;
    const read = c.sdk.getCloudStorage;
    c.sdk.getCloudStorage = async (keys) => {
      const data = await read(keys);
      switched = true;
      return data;
    };
    const client = c.client(deviceA, owner, async () => {
      if (switched) throw new AccountChangedError("switched");
    });
    await expect(client.write(rich())).rejects.toThrow("switched");
    expect(c.sdk.setCloudStorage).not.toHaveBeenCalled();
  });
  it("fresh-device legacy sync cannot downgrade 24 outfits / six chapters", async () => {
    const cloud = mockCloud();
    (window as any).toy = cloud.sdk;
    cloud.values.progress_v1 = JSON.stringify({
      ...rich().progress,
      companion: { owned: 0xffffff, heart: 90 },
    });
    await syncProgress({
      ...fresh().progress,
      companion: { owned: 3, heart: 0 },
    });
    const saved = JSON.parse(cloud.values.progress_v1);
    expect(saved.unlocked).toBe(6);
    expect(saved.chapter).toBe(5);
    expect(saved.companion.owned).toBe(0xffffff);
    expect(saved.companion.heart).toBe(90);
    cloud.values.progress_v1 = "null";
    const calls = vi.mocked(cloud.sdk.setCloudStorage).mock.calls.length;
    await expect(syncProgress(fresh().progress)).rejects.toThrow();
    expect(vi.mocked(cloud.sdk.setCloudStorage).mock.calls).toHaveLength(calls);
  });
  it("requires OpenID, never invents identity from nickname/avatar", async () => {
    const cloud = mockCloud();
    expect(await toyOwner(cloud.sdk)).toMatch(/^[a-f0-9]{64}$/);
    cloud.sdk.getUserProfile = async () => ({
      nickname: "same-name",
      avatar: "",
    });
    await expect(toyOwner(cloud.sdk)).rejects.toThrow("身份");
  });
  it("restores a full new-device save then a low progress write preserves every unlock", async () => {
    const c = mockCloud();
    await c.client().write(rich());
    const result = await c.client(deviceB).read(fresh());
    expect(result.save.progress.unlocked).toBe(6);
    expect(result.save.progress.chapter).toBe(5);
    expect(result.save.companion.owned).toBe(0xffffff);
    expect(result.save.session).toEqual(rich().session);
    expect(result.save.dates).toEqual(rich().dates);
    expect(result.save.settings).toEqual(rich().settings);
    await c.client(deviceB).write(fresh());
    expect((await c.client().read(fresh())).save.companion.owned).toBe(
      0xffffff,
    );
  });
  it("parallel device commits preserve the union even when reads both see an empty cloud", async () => {
    const c = mockCloud(),
      a = fresh(),
      b = fresh();
    a.companion.owned = 7;
    b.companion.owned = 11;
    a.companion.claimed = ["match:aaa"];
    b.companion.claimed = ["match:bbb"];
    await Promise.all([c.client().write(a), c.client(deviceB).write(b)]);
    const saved = (await c.client().read(fresh())).save;
    expect(saved.companion.owned).toBe(15);
    expect(saved.companion.claimed).toEqual(["match:aaa", "match:bbb"]);
  });
  it("late older immutable manifests cannot replace the higher progress", async () => {
    const c = mockCloud();
    await c.client().write(fresh());
    const old = { ...c.values };
    await c.client(deviceB).write(rich());
    Object.assign(c.values, old);
    expect((await c.client().read(fresh())).save.progress.unlocked).toBe(6);
  });
  it("partial chunk failure never publishes a manifest and old full save remains readable", async () => {
    const c = mockCloud();
    await c.client().write(rich());
    const originals = { ...c.values };
    c.sdk.setCloudStorage = vi.fn(async (items: Record<string, string>) => {
      const [k, v] = Object.entries(items)[0];
      c.values[k] = v;
      throw Error("offline");
    });
    await expect(c.client(deviceB).write(fresh())).rejects.toThrow("offline");
    for (const [k, v] of Object.entries(originals)) expect(c.values[k]).toBe(v);
    expect(Object.keys(c.values).filter((k) => k.includes("_m_"))).toHaveLength(
      1,
    );
    expect((await c.client().read(fresh())).save.session).toEqual(
      rich().session,
    );
  });
  it("unconfirmed chunks are not made visible; corrupt newest full falls back to older", async () => {
    const c = mockCloud();
    await c.client().write(rich());
    await c.client().write(rich());
    const commits = Object.entries(c.values)
      .filter(([k]) => k.includes("_m_"))
      .map(([k, v]) => ({ k, c: JSON.parse(v) }))
      .sort((a, b) => b.c.savedAt - a.c.savedAt);
    const newest = commits[0].k.replace("_m_", "_s_") + "_0";
    c.values[newest] = "broken";
    const result = await c.client().read(fresh());
    expect(result.candidates).toHaveLength(1);
    expect(result.warnings.join()).toContain("回退");
    expect(result.save.session).toEqual(rich().session);
    await c.client().write(rich());
    expect((await c.client().read(fresh())).candidates).toHaveLength(2);
  });
  it("cleans only its own writer after confirmation, keeps two valid backups and unknown originals", async () => {
    const c = mockCloud();
    await c.client(deviceB).write(rich());
    const otherKeys = Object.keys(c.values);
    await c.client().write(fresh());
    const invalid = `wg2_${owner.slice(0, 20)}_${deviceA}_m_${"e".repeat(32)}`;
    c.values[invalid] = "invalid";
    await c.client().write(rich());
    await c.client().write(rich());
    expect(
      (await c.client().read(fresh())).candidates.filter(
        (x) => x.device === deviceA,
      ),
    ).toHaveLength(2);
    for (const k of otherKeys) expect(c.values[k]).toBeTruthy();
    expect(c.values[invalid]).toBe("invalid");
    expect(
      vi
        .mocked(c.sdk.removeCloudStorage!)
        .mock.calls.flat(2)
        .some((k) => otherKeys.includes(k)),
    ).toBe(false);
  });
  it("quota retries preserve originals, keep pending, and do not consume keys repeatedly", async () => {
    const c = mockCloud();
    for (let i = 0; i < 127; i++) c.values[`other_${i}`] = "x";
    await expect(c.client().write(rich())).rejects.toThrow("空间不足");
    const keys = Object.keys(c.values);
    await expect(c.client().write(rich())).rejects.toThrow("空间不足");
    expect(Object.keys(c.values)).toEqual(keys);
    expect(keys).toHaveLength(128);
  });
  it("cloud read failures or wholly corrupt manifests stop all writes", async () => {
    const c = mockCloud();
    c.values.progress_v1 = "{broken";
    await expect(c.client().write(fresh())).rejects.toThrow("停止");
    expect(c.sdk.setCloudStorage).not.toHaveBeenCalled();
    delete c.values.progress_v1;
    c.values[`wg2_${owner.slice(0, 20)}_bad_m_bad`] = "null";
    await expect(c.client().write(fresh())).rejects.toThrow("损坏");
    expect(c.sdk.setCloudStorage).not.toHaveBeenCalled();
    c.sdk.getCloudStorage = async () => {
      throw Error("network");
    };
    await expect(c.client().write(fresh())).rejects.toThrow("network");
    expect(c.sdk.setCloudStorage).not.toHaveBeenCalled();
  });
  it("owner-bound snapshots cannot be adopted by a different account; changes stop writes", async () => {
    const c = mockCloud();
    await c.client().write(rich());
    expect((await c.client(deviceB, other).read(fresh())).found).toBe(false);
    const checked = c.client(deviceB, owner, async () => {
      throw new AccountChangedError("switched");
    });
    const calls = vi.mocked(c.sdk.setCloudStorage).mock.calls.length;
    await expect(checked.write(fresh())).rejects.toThrow("switched");
    expect(vi.mocked(c.sdk.setCloudStorage).mock.calls).toHaveLength(calls);
  });
  it("pending survives a failed sync/relaunch; upload never clears a newer local revision", async () => {
    const c = mockCloud(),
      port = getPlayerStorage(owner);
    writePlayerSave(port, rich());
    let fail = true;
    const get = c.sdk.getCloudStorage;
    c.sdk.getCloudStorage = async (keys) => {
      if (fail) throw Error("offline");
      return get(keys);
    };
    await expect(new SaveManager(port, c.client()).sync()).rejects.toThrow(
      "offline",
    );
    expect(port.getMeta("dirty")).toBe("1");
    fail = false;
    const manager = new SaveManager(port, c.client()),
      set = c.sdk.setCloudStorage;
    let mutated = false;
    c.sdk.setCloudStorage = async (items) => {
      await set(items);
      if (!mutated) {
        mutated = true;
        port.setItem(PLAYER_KEYS.settings, JSON.stringify({ view: "2d" }));
      }
    };
    await manager.sync();
    expect(port.getMeta("dirty")).toBe("1");
    await manager.sync();
    expect(port.getMeta("dirty")).toBeNull();
    expect((await c.client().read(fresh())).save.settings.view).toBe("2d");
  });
  it("bounded timeout reports failure instead of claiming success", async () => {
    await expect(bounded(new Promise(() => {}), 5)).rejects.toThrow("超时");
  });
});
