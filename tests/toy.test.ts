import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchRanks,
  getCloudProgress,
  isToyHost,
  readProgress,
  saveProgress,
  submitTrial,
  syncProgress,
  toyError,
  type Progress,
  type ToySDK,
} from "../src/platform/toy";

const progress: Progress = {
  schema: 1,
  unlocked: 3,
  chapter: 2,
  taps: 15,
  best: 1300,
};
let storage: Map<string, string>, cloud: Record<string, string>, sdk: ToySDK;
beforeEach(() => {
  storage = new Map();
  cloud = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  sdk = {
    isSupport: vi.fn(async () => true),
    submitScore: vi.fn(async ({ score }) => ({ score })),
    getRankList: vi.fn(async () => [
      { rank: 1, score: 1300, nickname: "测试棋友", avatar: "" },
    ]),
    getMyRank: vi.fn(async () => ({ ranked: true, rank: 1, score: 1300 })),
    getCloudStorage: vi.fn(async () => cloud),
    setCloudStorage: vi.fn(async (items) => {
      Object.assign(cloud, items);
    }),
  };
  vi.stubGlobal("window", { toy: sdk });
});
afterEach(() => vi.unstubAllGlobals());

describe("Toy SDK 适配契约（Mock，不代表真实平台接入）", () => {
  it("不以任意域名推断已进入 Toy 容器", () => {
    expect(isToyHost()).toBe(true);
    (window as any).toy = undefined;
    expect(isToyHost()).toBe(false);
  });
  it("榜单使用真实 API 参数与返回值，没有伪造榜单", async () => {
    expect((await fetchRanks())[0].nickname).toBe("测试棋友");
    expect(sdk.getRankList).toHaveBeenCalledWith({
      board: 1,
      period: "all",
      limit: 30,
    });
  });
  it("成绩范围和整数校验发生在 SDK 提交前", async () => {
    expect(await submitTrial(1300)).toBe(1300);
    expect(sdk.submitScore).toHaveBeenCalledWith({ board: 1, score: 1300 });
    for (const value of [-1, 1.2, NaN, 16777216])
      await expect(submitTrial(value)).rejects.toThrow("成绩无效");
    expect(sdk.submitScore).toHaveBeenCalledTimes(1);
  });
  it("云存档传对象并可读取恢复，不超过平台 value 限额", async () => {
    await syncProgress(progress);
    expect(sdk.setCloudStorage).toHaveBeenCalledWith({
      progress_v1: JSON.stringify(progress),
    });
    expect(await getCloudProgress()).toEqual(progress);
    expect(sdk.getCloudStorage).toHaveBeenCalledWith(["progress_v1"]);
  });
  it("云端异常存档拒绝恢复，小数和 null 不能进入 UI", async () => {
    for (const value of [
      null,
      { ...progress, chapter: 1.2 },
      { ...progress, taps: -1 },
      { ...progress, unlocked: 7 },
      { ...progress, best: "1300" },
    ]) {
      cloud.progress_v1 = JSON.stringify(value);
      await expect(getCloudProgress()).rejects.toThrow("格式无效");
    }
  });
  it("SDK 拒绝会传播，不将本地结果冒充云端结果", async () => {
    sdk.submitScore = vi.fn(async () => {
      throw { type: "not_logged_in" };
    });
    await expect(submitTrial(1000)).rejects.toMatchObject({
      type: "not_logged_in",
    });
    expect(toyError({ type: "not_logged_in" })).toContain("登录");
    expect(toyError({ code: 307044 })).toContain("手动重试");
    expect(toyError({ type: "timeout" })).not.toContain("已保存");
  });
  it("衣柜云备份保持紧凑，旧档兼容，非法衣柜拒绝恢复", async () => {
    const next = { ...progress, companion: { owned: 0xffffff, heart: 78 } };
    await syncProgress(next);
    expect(
      new TextEncoder().encode(cloud.progress_v1).length,
    ).toBeLessThanOrEqual(1024);
    expect(await getCloudProgress()).toEqual(next);
    saveProgress(next);
    expect(readProgress()).toEqual(next);
    cloud.progress_v1 = JSON.stringify(progress);
    expect(await getCloudProgress()).toEqual(progress);
    for (const companion of [
      { owned: 2, heart: 1 },
      { owned: 3, heart: 101 },
      null,
    ]) {
      cloud.progress_v1 = JSON.stringify({ ...progress, companion });
      await expect(getCloudProgress()).rejects.toThrow("格式无效");
    }
  });
  it("本机存储损坏或不可写时安全失败", () => {
    expect(readProgress().unlocked).toBe(1);
    expect(saveProgress(progress)).toBe(true);
    expect(readProgress()).toEqual(progress);
    storage.set("wizards-gambit-progress-v1", "null");
    expect(readProgress().unlocked).toBe(1);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("disabled");
      },
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(saveProgress(progress)).toBe(false);
    expect(readProgress().best).toBe(0);
  });
});
