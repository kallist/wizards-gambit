import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { createGame, legalMoves } from "../../src/domain/engine";
import { forcingMove } from "../helpers/journeySolver";
import type { JourneyProgress } from "../../src/journey/model";

const key = "wizards-gambit-journey-v1";
const output = ".local/v12-implementation/screens";
async function saved(page: Page): Promise<JourneyProgress> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    key,
  );
}
async function open(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /今晚棋旅|继续这一晚/ })
    .first()
    .click();
  await expect(page.getByTestId("journey-screen")).toBeVisible();
}
async function begin(page: Page) {
  await open(page);
  await page.getByRole("button", { name: "和你一起出发", exact: true }).click();
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "playing",
  );
}
async function finishNode(page: Page) {
  for (let i = 0; i < 9; i++) {
    await expect
      .poll(
        async () => {
          const r = (await saved(page)).activeRun!;
          return r.stage !== "playing" || r.game!.turn === "white";
        },
        { timeout: 20000 },
      )
      .toBe(true);
    const r = (await saved(page)).activeRun!;
    if (r.stage !== "playing") return;
    const action = forcingMove(r.game!);
    expect(action?.type).toBe("move");
    if (action?.type !== "move") throw new Error("No bounded solution");
    const from =
      "abcdefgh"[action.move.from % 8] + (8 - Math.floor(action.move.from / 8));
    const to =
      "abcdefgh"[action.move.to % 8] + (8 - Math.floor(action.move.to / 8));
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
    await expect
      .poll(async () => (await saved(page)).activeRun!.game!.version)
      .toBeGreaterThan(r.game!.version);
  }
  throw new Error("Node did not finish within its bounded strategy");
}

test("one evening: real cast, tea, route, three mates, file backup and next invitation", async ({
  page,
}) => {
  await mkdir(output, { recursive: true });
  const ordinary = {
    mode: "local",
    chapter: 0,
    human: "white",
    difficulty: "gentle",
    matchId: "local:preserved",
    state: createGame("classic", 789),
  };
  await page.addInitScript((ordinary) => {
    if (!localStorage.getItem("wizards-gambit-session-v1"))
      localStorage.setItem(
        "wizards-gambit-session-v1",
        JSON.stringify(ordinary),
      );
  }, ordinary);
  await begin(page);
  await page.screenshot({ path: output + "/desktop-playing.png" });
  await page
    .getByRole("button", { name: /飞来咒/ })
    .nth(1)
    .click();
  await page.locator('[data-square="d3"]').click();
  await page.locator('[data-square="d5"]').click();
  await page.getByRole("button", { name: "确认施法", exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).activeRun!.remainingHand.length)
    .toBe(2);
  await page.locator('[data-square="f6"]').click();
  await page.locator('[data-square="g6"]').click();
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "tea",
  );
  await page.screenshot({ path: output + "/desktop-tea-before.png" });
  await page.getByRole("button", { name: "把茶递给她", exact: true }).click();
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "route",
  );
  await expect(page.getByTestId("journey-tea-scene")).toHaveAttribute(
    "data-tea-state",
    "1",
  );
  await expect(
    page.getByRole("heading", { name: "茶暖着，下一页你来挑" }),
  ).toBeInViewport();
  await page.screenshot({ path: output + "/desktop-tea-after.png" });
  await page.reload();
  await page
    .getByRole("button", { name: "继续这一晚", exact: false })
    .first()
    .click();
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "route",
  );
  await page.getByRole("button", { name: /先去 · 绕过守夜人/ }).click();
  await finishNode(page);
  await page.getByRole("button", { name: "继续下一段", exact: true }).click();
  await finishNode(page);
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "home",
  );
  expect((await saved(page)).activeRun!.outcome).toBe("complete");
  await page.getByRole("button", { name: "把这一晚留下", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "再约一晚", exact: true }),
  ).toBeVisible();
  expect((await saved(page)).memories).toHaveLength(1);
  await page.screenshot({ path: output + "/desktop-home.png" });
  await page.getByRole("button", { name: "返回小屋", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "杯垫上的这一晚", exact: true }),
  ).toContainText("你递来的茶，她接住了");
  await page.screenshot({ path: output + "/cottage-keepsake.png" });
  await page
    .getByRole("button", { name: "杯垫上的这一晚", exact: true })
    .click();
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "home",
  );
  const normalAfter = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("wizards-gambit-session-v1")!),
  );
  expect(normalAfter).toEqual(ordinary);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份文件", exact: true }).click();
  const file = await download;
  const backup = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(backup.save.schema).toBe(3);
  expect(backup.save.journey.memories).toHaveLength(1);
  expect(backup.save.session).toEqual(ordinary);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "再约一晚", exact: true }).click();
  await expect(page.locator(".mirror-dialogue")).toContainText(
    "你上回递茶时倒很稳",
  );
});

test("once-per-run retry, second failure ends battle path, practice never changes saved evening", async ({
  page,
}) => {
  await begin(page);
  const resign = async () => {
    await page.locator(".journey-tools summary").click();
    await page.getByRole("button", { name: "这盘认输", exact: true }).click();
  };
  await resign();
  await expect(
    page.getByRole("button", { name: "重试本节点", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重试本节点", exact: true }).click();
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "playing",
  );
  await resign();
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "home",
  );
  expect((await saved(page)).activeRun).toMatchObject({
    outcome: "failed",
    retriesUsed: 1,
  });
  await expect(
    page.getByRole("button", { name: "重试本节点", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "把这一晚留下", exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).lastMemory?.outcome)
    .toBe("failed");
  const before = await saved(page);
  await page
    .getByRole("button", { name: "无奖励练习这一盘", exact: true })
    .click();
  await finishPracticeMove(page);
  expect(await saved(page)).toEqual(before);
  await page.reload();
  await page
    .getByRole("button", { name: /今晚棋旅|继续这一晚/ })
    .first()
    .click();
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "home",
  );
  await expect(page.locator(".mirror-dialogue")).toContainText("茶还没倒");
});
async function finishPracticeMove(page: Page) {
  await page.locator('[data-square="e5"]').click();
  await expect(page.locator('[data-square="e6"]')).toBeEnabled();
  await page.locator('[data-square="e6"]').click();
}

test("save failure does not advance, a repeated click cannot duplicate start", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).restoreJourneyStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (k, v) {
      if (k.endsWith("wizards-gambit-journey-v1"))
        throw new Error("模拟磁盘已满");
      return original.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "和你一起出发", exact: true }).click();
  await expect(page.locator(".journey-notice")).toHaveText("模拟磁盘已满");
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "invite",
  );
  expect(await saved(page)).toBeNull();
  await page.evaluate(() => (window as any).restoreJourneyStorage());
  await page
    .getByRole("button", { name: "和你一起出发", exact: true })
    .dblclick();
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "playing",
  );
  expect(
    (await saved(page)).activeRun!.facts.filter((f) => f.type === "prepared"),
  ).toHaveLength(1);
});

test("360px short portrait keeps chess width, full mirror and state across renderer switch", async ({
  page,
}) => {
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 360, height: 640 });
  await begin(page);
  const width = await page
    .locator(".flat-square")
    .first()
    .evaluate((e) => e.getBoundingClientRect().width);
  expect(width).toBeGreaterThanOrEqual(38);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  await page.screenshot({
    path: output + "/mobile-360-playing.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "展开魔镜", exact: true }).click();
  await expect(
    page.locator(".mobile-mirror [data-testid=full-length-mirror]"),
  ).toBeVisible();
  await page.screenshot({
    path: output + "/mobile-mirror.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  const before = await saved(page);
  await page.locator(".journey-tools summary").click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator(".journey-screen canvas")).toBeVisible();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByTestId("board-2d")).toBeVisible();
  expect(await saved(page)).toEqual(before);
});

test("five viewports and doubled text retain readable actions and an unobstructed table", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await begin(page);
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [390, 844],
    [360, 640],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByTestId("board-2d")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    const square = await page.locator(".flat-square").first().boundingBox();
    expect(square!.width).toBeGreaterThanOrEqual(
      width > height && height <= 600 ? 30 : 38,
    );
    if (width < height && width <= 720) {
      await expect(
        page.getByRole("button", { name: "展开魔镜", exact: true }),
      ).toBeInViewport();
      const board = await page.getByTestId("board-2d").boundingBox();
      expect(board!.y + board!.height).toBeLessThanOrEqual(height);
    } else {
      await expect(page.getByTestId("full-length-mirror")).toBeVisible();
    }
    await page.locator(".journey-tools summary").click();
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await page.locator(".journey-tools summary").press("Escape");
    await page.screenshot({ path: output + `/layout-${width}x${height}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    for (const e of document.querySelectorAll<HTMLElement>(".journey-screen *"))
      e.style.fontSize = `${parseFloat(getComputedStyle(e).fontSize) * 2}px`;
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "一起看这一步", exact: true }).click();
  await expect(page.getByRole("region", { name: "一起商量" })).toBeVisible();
  await page.getByRole("button", { name: "展开魔镜", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "魔镜里的她" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.screenshot({ path: output + "/text-200.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("a delayed Worker answer cannot play or replace dialogue after returning home", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as any).heldJourneyWorker = this;
      }
      postMessage(message: any) {
        (this as any).heldMessage = message;
      }
    } as typeof Worker;
  });
  await begin(page);
  await page.locator('[data-square="e5"]').click();
  await page.locator('[data-square="e6"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).heldJourneyWorker.heldMessage?.state.turn,
      ),
    )
    .toBe("black");
  const action = {
    type: "move" as const,
    move: legalMoves((await saved(page)).activeRun!.game!)[0],
  };
  await page.getByRole("button", { name: "今晚先回家", exact: true }).click();
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "home",
  );
  const before = await saved(page);
  const notice = await page.locator(".journey-notice").textContent();
  await page.evaluate(async (action) => {
    const w = (window as any).heldJourneyWorker;
    w.onmessage({ data: { id: w.heldMessage.id, action } });
    await navigator.locks.request("wizard-journey:local", () => {});
  }, action);
  await expect(page.locator(".journey-notice")).toHaveText(notice!);
  expect(await saved(page)).toEqual(before);
  await expect(page.getByTestId("journey-screen")).toHaveAttribute(
    "data-stage",
    "home",
  );
});
