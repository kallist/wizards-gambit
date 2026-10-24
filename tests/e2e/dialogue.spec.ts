import { test, expect, type Page } from "@playwright/test";
import { openTable } from "./navigation";

async function startLocal(page: Page) {
  await page.goto("/");
  await openTable(page);
  await page.getByRole("button", { name: /同机双人/ }).click();
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
}

test("小屋连续轻触换对白和实际图像，跨阶段后刷新保留亲近程度", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "进入游戏", exact: true }).click();
  await page.getByRole("button", { name: "和马尔福聊聊", exact: true }).click();
  const portrait = page.getByTestId("malfoy-portrait");
  const sprite = portrait.getByTestId("outfit-sprite");
  let previousExpression = await sprite.getAttribute("data-expression");
  let previousText = await page.locator(".hub-dialogue p").innerText();
  let previousHarry = await page.locator(".hub-dialogue small").innerText();
  let previousPixels = (await sprite.locator("svg").screenshot()).toString(
    "base64",
  );
  for (let i = 1; i <= 16; i++) {
    await portrait.click();
    await expect(sprite).not.toHaveAttribute(
      "data-expression",
      previousExpression!,
    );
    await expect(page.locator(".hub-dialogue p")).not.toHaveText(previousText);
    await expect(page.locator(".hub-dialogue small")).not.toHaveText(
      previousHarry,
    );
    await sprite
      .locator("img")
      .evaluate((el) => (el as HTMLImageElement).decode());
    const pixels = (await sprite.locator("svg").screenshot()).toString(
      "base64",
    );
    expect(pixels).not.toBe(previousPixels);
    previousExpression = await sprite.getAttribute("data-expression");
    previousText = await page.locator(".hub-dialogue p").innerText();
    previousHarry = await page.locator(".hub-dialogue small").innerText();
    previousPixels = pixels;
  }
  await expect(portrait).toHaveAttribute("data-stage", "4");
  // Clicking the small room character also counts as one touch.
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("wizards-gambit-progress-v1")!).taps,
    ),
  ).toBe(17);
  await page.reload();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("wizards-gambit-progress-v1")!).taps,
    ),
  ).toBe(17);
  await page.getByRole("button", { name: "进入游戏", exact: true }).click();
  await page.getByRole("button", { name: "和马尔福聊聊", exact: true }).click();
  await expect(page.getByTestId("malfoy-portrait")).toHaveAttribute(
    "data-stage",
    "4",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("wizards-gambit-progress-v1")!).taps,
    ),
  ).toBe(18);
});

test("封顶后连续互动仍换脸，聊天轮换且旧计时器不覆盖新回应，棋局不变", async ({
  page,
}) => {
  // Install before the app creates timers: a pre-install native timer cannot
  // safely be cancelled through the later fake-clock implementation.
  await page.clock.install();
  await page.addInitScript(() =>
    localStorage.setItem(
      "wizards-gambit-progress-v1",
      JSON.stringify({
        schema: 1,
        unlocked: 1,
        chapter: 0,
        taps: 100000,
        best: 0,
      }),
    ),
  );
  await startLocal(page);
  const session = await page.evaluate(() =>
    localStorage.getItem("wizards-gambit-session-v1"),
  );
  const chat = page.getByRole("button", { name: "和她聊聊", exact: true });
  const response = page.locator(".mirror-dialogue .companion-response");
  await chat.click();
  await expect(response).toHaveText("看我做什么？杯子都快空了。");
  await chat.click();
  await expect(response).toHaveText("明晚八点。别让我等。");
  await chat.click();
  await expect(response).toHaveText("看我做什么？杯子都快空了。");
  const portrait = page.getByTestId("malfoy-portrait");
  const sprite = portrait.getByTestId("outfit-sprite");
  let previous = await sprite.getAttribute("data-expression");
  let previousText = await response.innerText();
  for (let i = 0; i < 12; i++) {
    await portrait.click();
    await expect(sprite).not.toHaveAttribute("data-expression", previous!);
    await expect(response).not.toHaveText(previousText);
    previous = await sprite.getAttribute("data-expression");
    previousText = await response.innerText();
  }
  await page.clock.fastForward(6000);
  await expect(sprite).toHaveAttribute("data-expression", previous!);
  await expect(response).toHaveText(previousText);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wizards-gambit-session-v1"),
    ),
  ).toBe(session);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("wizards-gambit-progress-v1")!).taps,
    ),
  ).toBe(100000);
  // A subsequent ordinary conversation takes back control of the expression.
  await chat.click();
  await expect(sprite).toHaveAttribute("data-expression", "7");
  await expect(response).toHaveText("明晚八点。别让我等。");
  await portrait.click();
  await expect(sprite).not.toHaveAttribute("data-expression", "0");
  await page.getByRole("button", { name: "返回小屋", exact: true }).click();
  await openTable(page);
  await page.getByRole("button", { name: /同机双人/ }).click();
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await expect(
    page.getByTestId("malfoy-portrait").getByTestId("outfit-sprite"),
  ).toHaveAttribute("data-expression", "0");
});

test("竖屏头像与展开的魔镜同步当前神态", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startLocal(page);
  await page.getByRole("button", { name: "展开魔镜", exact: true }).click();
  const portrait = page.getByTestId("malfoy-portrait");
  const face = page.locator(".mobile-companion-face [data-expression]");
  const full = portrait.getByTestId("outfit-sprite");
  for (let i = 0; i < 4; i++) {
    const before = await full.getAttribute("data-expression");
    await portrait.click();
    await expect(full).not.toHaveAttribute("data-expression", before!);
    await expect(face).toHaveAttribute(
      "data-expression",
      (await full.getAttribute("data-expression"))!,
    );
  }
});

test("书写字体从本地加载，标题和主按钮使用它，正文仍用阅读字体", async ({
  page,
}) => {
  await page.goto("/");
  const loaded = await page.evaluate(async () => {
    const faces = await document.fonts.load(
      '32px "星夜手书"',
      "巫师棋进入游戏",
    );
    return faces.length > 0 && faces.every((f) => f.status === "loaded");
  });
  expect(loaded).toBe(true);
  // A loaded subset can still fall back for newly introduced Chinese glyphs.
  const fallbackGlyphs = await page.evaluate(async () => {
    const glyphs = "垫守引扣暖窗纹绕";
    await document.fonts.load('40px "星夜手书"', glyphs);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const raster = (glyph: string, font: string) => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.font = font;
      ctx.fillText(glyph, 8, 48);
      return ctx.getImageData(0, 0, 64, 64).data.slice();
    };
    return [...glyphs].filter((glyph) => {
      const written = raster(glyph, '40px "星夜手书", serif');
      const fallback = raster(glyph, "40px serif");
      return written.every((v, i) => v === fallback[i]);
    });
  });
  expect(fallbackGlyphs).toEqual([]);
  expect(
    await page
      .locator(".cottage-title h1")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("星夜手书");
  expect(
    await page
      .getByRole("button", { name: "进入游戏", exact: true })
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("星夜手书");
  await page.getByRole("button", { name: "进入游戏", exact: true }).click();
  await page.getByRole("button", { name: "和马尔福聊聊", exact: true }).click();
  expect(
    await page
      .locator(".hub-dialogue p")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).not.toContain("星夜手书");
});

test("字体加载失败时仍能在窄屏进入棋局且不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/fonts/*.woff2", (route) => route.abort());
  await startLocal(page);
  await expect(page.getByTestId("board-2d")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "展开魔镜", exact: true }).click();
  await expect(page.getByTestId("malfoy-portrait")).toBeVisible();
});
