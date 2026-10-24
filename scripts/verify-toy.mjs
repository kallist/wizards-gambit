// Static Toy artifact + SDK Mock verification; never a real Toy integration test.
import { chromium, expect } from "@playwright/test";
import { makeGameServer } from "../server/index.ts";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";

async function openTable(page) {
  if (
    await page
      .getByRole("button", { name: "进入游戏", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "进入游戏", exact: true }).click();
  if (await page.getByRole("button", { name: "收起聊天" }).isVisible())
    await page.getByRole("button", { name: "收起聊天" }).click();
  if (!(await page.getByRole("region", { name: "选择棋局" }).isVisible()))
    await page.getByRole("button", { name: "打开棋桌" }).click();
}

const server = makeGameServer({ staticRoot: resolve("dist-toy") });
const handler = server.http.listeners("request")[0];
server.http.removeAllListeners("request");
server.http.on("request", (req, res) => {
  req.url = req.url.replace(/^\/toy\/preview/, "");
  handler(req, res);
});
await new Promise((done) => server.http.listen(0, "127.0.0.1", done));
const port = server.http.address().port;
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-gpu-compositing",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [],
    failed = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  await page.addInitScript(() => {
    window.mockToyCalls = [];
    let cloud = {};
    window.toy = {
      getUserProfile: async () => ({
        toyOpenId: "isolated-artifact-test",
        nickname: "SDK Mock",
        avatar: "",
      }),
      isSupport: async () => true,
      getRankList: async (p) => {
        window.mockToyCalls.push(["rank", p]);
        return [
          { rank: 1, score: 1300, nickname: "SDK Mock 棋友", avatar: "" },
        ];
      },
      getMyRank: async () => ({ ranked: true, rank: 1, score: 1300 }),
      submitScore: async (p) => {
        window.mockToyCalls.push(["score", p]);
        return { score: p.score };
      },
      getCloudStorage: async (keys) => {
        window.mockToyCalls.push(["load", keys]);
        return Object.fromEntries(
          Object.entries(cloud).filter(
            ([key]) => !keys?.length || keys.includes(key),
          ),
        );
      },
      setCloudStorage: async (value) => {
        Object.assign(cloud, value);
        window.mockToyCalls.push(["save", value]);
      },
      removeCloudStorage: async (keys) => {
        for (const key of keys) delete cloud[key];
      },
    };
  });
  const fontResponse = page.waitForResponse((r) =>
    r.url().endsWith("/toy/preview/fonts/mashanzheng-ui.woff2"),
  );
  await page.goto(`http://127.0.0.1:${port}/toy/preview/`);
  await page.getByRole("button", { name: "连接B站存档", exact: true }).click();
  expect((await fontResponse).ok()).toBe(true);
  expect(
    await page.evaluate(async () => {
      const fonts = await document.fonts.load(
        '24px "星夜手书"',
        "巫师棋进入游戏",
      );
      return (
        fonts.length > 0 && fonts.every((font) => font.status === "loaded")
      );
    }),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: /巫师棋：与马尔福的甜蜜生活/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /今晚棋旅/ })
    .first()
    .click();
  await page.getByRole("button", { name: "和你一起出发", exact: true }).click();
  await expect(page.getByTestId("board-2d")).toBeVisible();
  await page
    .getByRole("button", { name: /飞来咒/ })
    .nth(1)
    .click();
  await page.locator('[data-square="d3"]').click();
  await page.locator('[data-square="d5"]').click();
  await page.getByRole("button", { name: "确认施法", exact: true }).click();
  await page.locator('[data-square="f6"]').click();
  await page.locator('[data-square="g6"]').click();
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "tea",
  );
  await expect
    .poll(() =>
      page
        .locator(".journey-tea-picture img")
        .evaluate((img) => img.complete && img.naturalWidth === 2172),
    )
    .toBe(true);
  const journeySnapshot = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) =>
      k.endsWith(":wizards-gambit-journey-v1"),
    );
    return JSON.parse(localStorage.getItem(key));
  });
  await page.getByRole("button", { name: "返回小屋", exact: true }).click();
  await page.getByTestId("malfoy-portrait").click();
  await page.getByRole("button", { name: "排行榜", exact: true }).click();
  await expect(page.getByText("SDK Mock 棋友")).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "立即同步", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("完整存档已同步");
  await page.getByRole("button", { name: "合并云端存档", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /巫师棋：与马尔福/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) =>
        k.endsWith(":wizards-gambit-journey-v1"),
      );
      return JSON.parse(localStorage.getItem(key));
    }),
  ).toEqual(journeySnapshot);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await openTable(page);
  await page.getByRole("button", { name: /好友联网/ }).click();
  await page.getByRole("button", { name: /为我们留一间棋室/ }).click();
  await expect(page.getByRole("status")).toContainText("好友棋室尚未开放");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await openTable(page);
  await page.getByRole("button", { name: /人机对弈/ }).click();
  await page.getByRole("button", { name: /经典巫师棋/ }).click();
  await page.getByRole("combobox").selectOption("gentle");
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByRole("button", { name: "e2 白兵", exact: true }).click();
  await page.getByRole("button", { name: /e4 空格/ }).click();
  await expect(
    page.getByText("轮到你了 · 从容落子", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "棋局手札", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("2 步");
  await expect(page.locator(".history-list li")).toHaveCount(2);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "返回小屋", exact: true }).click();
  await openTable(page);
  await page.getByRole("button", { name: /赴一场约棋/ }).click();
  await page.getByRole("button", { name: "稍后再读" }).click();
  await page.getByRole("button", { name: "a4 白城堡", exact: true }).click();
  await page.getByRole("button", { name: /a6 黑骑士/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saves = window.mockToyCalls.filter((call) => call[0] === "save");
        const commits = saves.flatMap((call) =>
          Object.entries(call[1])
            .filter(([key]) => key.includes("_m_"))
            .map(([, value]) => JSON.parse(value)),
        );
        return commits.at(-1)?.progress.companion?.owned ?? 3;
      }),
    )
    .not.toBe(3);
  const calls = await page.evaluate(() => window.mockToyCalls);
  expect(calls.some((c) => c[0] === "rank")).toBe(true);
  expect(calls.some((c) => c[0] === "save")).toBe(true);
  expect(calls.some((c) => c[0] === "load")).toBe(true);
  const saves = calls.filter((call) => call[0] === "save");
  const manifests = saves.flatMap((call) =>
    Object.entries(call[1])
      .filter(([key]) => key.includes("_m_"))
      .map(([, value]) => JSON.parse(value)),
  );
  expect(manifests.length).toBeGreaterThan(0);
  const saved = manifests.at(-1).progress;
  expect(saved.unlocked).toBe(2);
  expect(saved.companion.owned.toString(2).replaceAll("0", "")).toHaveLength(3);
  expect(saved.companion.heart).toBe(5);
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
  expect((await stat("dist-toy/index.html")).size).toBeLessThan(1_000_000);
  console.log(
    "PASS: nested assets + tea atlas + local WOFF2, journey cast/mate + SDK Mock snapshot restore, Worker move, SDK Mock identity/full save/rank, chapter+outfit immutable commit, explicit unavailable room. REAL TOY: NOT TESTED.",
  );
} finally {
  await browser.close();
  await server.close();
}
