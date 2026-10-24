import { expect, test } from "@playwright/test";
import { openTable } from "./navigation";
import { createHash } from "node:crypto";

test("小屋、聊天与棋盘往返不重开棋局，刷新保留棋步", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("巫师棋：与马尔福的甜蜜生活");
  await page.getByRole("button", { name: "进入游戏", exact: true }).click();
  await expect(page.getByTestId("cottage-hub")).toHaveAttribute(
    "data-state",
    "room",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wizards-gambit-session-v1"),
    ),
  ).toBeNull();
  await openTable(page);
  await page.getByRole("button", { name: /同机双人/ }).click();
  await page.getByRole("button", { name: /经典巫师棋/ }).click();
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await expect(page.getByTestId("board-2d")).toBeVisible();
  await page.getByRole("button", { name: "e2 白兵", exact: true }).click();
  await page.getByRole("button", { name: /e4 空格/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  const saved = await page.evaluate(() =>
    localStorage.getItem("wizards-gambit-session-v1"),
  );
  await page.getByRole("button", { name: "返回小屋", exact: true }).click();
  await page.getByRole("button", { name: "和马尔福聊聊", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "与马尔福交谈" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "聊聊今天", exact: true }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wizards-gambit-session-v1"),
    ),
  ).toBe(saved);
  await openTable(page);
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await expect(
    page.getByRole("button", { name: "e4 白兵", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wizards-gambit-session-v1"),
    ),
  ).toBe(saved);
});

test("初始两套八表情都只画一个完整居中的人物", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/");
  await page.getByRole("button", { name: "衣装收藏", exact: true }).click();
  for (const outfit of ["绿银学院", "翡翠晚宴"]) {
    await page
      .getByRole("button", { name: `衣装 ${outfit} 已拥有`, exact: true })
      .click();
    for (const expression of [
      "傲娇",
      "浅羞",
      "明显害羞",
      "眨眼",
      "欢笑",
      "气鼓鼓",
      "担心",
      "温柔",
    ]) {
      await page.getByRole("button", { name: expression, exact: true }).click();
      const sprite = page.locator(".wardrobe-preview .outfit-sprite");
      await sprite
        .locator("img")
        .evaluate((img) => (img as HTMLImageElement).decode());
      await sprite.evaluate(
        (el) => ((el as HTMLElement).style.background = "#112228"),
      );
      const png = await sprite.screenshot({ animations: "disabled" });
      const bounds = await page.evaluate(async (encoded) => {
        const image = new Image();
        image.src = `data:image/png;base64,${encoded}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
        let left = image.width,
          right = 0,
          top = image.height,
          bottom = 0;
        for (let y = 0; y < image.height; y++)
          for (let x = 0; x < image.width; x++) {
            const i = (y * image.width + x) * 4;
            if (
              Math.abs(pixels[i] - 17) +
                Math.abs(pixels[i + 1] - 34) +
                Math.abs(pixels[i + 2] - 40) <
              65
            )
              continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        return {
          left,
          right,
          top,
          bottom,
          width: image.width,
          height: image.height,
        };
      }, png.toString("base64"));
      expect(
        bounds.left,
        `${outfit}/${expression}: left gutter must stay empty`,
      ).toBeGreaterThan(2);
      expect(bounds.right).toBeLessThan(bounds.width - 3);
      expect(
        Math.abs((bounds.left + bounds.right) / 2 - bounds.width / 2),
      ).toBeLessThan(8);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThan(bounds.height);
      expect(
        Math.max(
          (bounds.bottom - bounds.top) / bounds.height,
          (bounds.right - bounds.left) / bounds.width,
        ),
      ).toBeGreaterThan(0.8);
    }
  }
});

test("选子与已确认棋步进入魔镜，聊天和展开心事不改变棋局", async ({ page }) => {
  await page.goto("/");
  await openTable(page);
  await page.getByRole("button", { name: /同机双人/ }).click();
  await page.getByRole("button", { name: /经典巫师棋/ }).click();
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  const saved = () =>
    page.evaluate(() => localStorage.getItem("wizards-gambit-session-v1"));
  const initial = await saved();
  const moment = page.getByTestId("companion-board-moment");
  await page.getByRole("button", { name: "e2 白兵", exact: true }).click();
  await expect(moment).toContainText("e2 · 兵已选好");
  expect(await saved()).toBe(initial);
  await page.getByRole("button", { name: "e2 白兵", exact: true }).click();
  await expect(moment).not.toContainText("兵已选好");
  await page.getByRole("button", { name: "e2 白兵", exact: true }).click();
  await page.getByRole("button", { name: /e4 空格/ }).click();
  await expect(moment).toContainText("等你们交接棋子");
  await page.getByRole("button", { name: /我已接手/ }).click();
  await expect(moment).toContainText("e2");
  await expect(moment).toContainText("e4");
  await expect(page.locator(".player-bar strong")).toHaveText("哈利 · 波特");
  await expect(page.locator(".player-avatar")).toHaveClass(/harry/);
  expect(
    await page
      .locator(".player-avatar")
      .evaluate((el) => getComputedStyle(el).backgroundImage),
  ).toContain("pixel-cottage-v6");
  await expect(page.locator(".mirror-dialogue")).toContainText(
    "好，至少不是闭着眼睛下的。",
  );
  const moved = await saved();
  expect(moved).not.toBe(initial);
  await page.getByRole("button", { name: "和她聊聊", exact: true }).click();
  await page.locator(".mirror-thought summary").click();
  await expect(page.locator(".mirror-thought p")).toBeVisible();
  expect(await saved()).toBe(moved);
  await expect(moment).toContainText("e4");
});

test("银河真实变化，减少动态效果后停止运动", async ({ page }) => {
  await page.goto("/");
  const galaxy = page.getByTestId("galaxy-backdrop");
  await expect(galaxy).toHaveAttribute("data-render-engine", "three-webgl");
  await expect(galaxy).toHaveAttribute("data-galaxy-frame", /.+/);
  const sample = async () =>
    createHash("sha256")
      .update(await galaxy.screenshot())
      .digest("hex");
  const before = await sample();
  await expect.poll(sample).not.toBe(before);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("switch", { name: "减少动态效果" }).click();
  await expect(
    page.getByRole("switch", { name: "减少动态效果" }),
  ).toHaveAttribute("aria-checked", "true");
  // A canvas locator screenshot includes the composited modal above it. Remove
  // the switch's hover first so later mouse movement tests the frozen galaxy.
  await page.mouse.move(50, 50);
  let previous = "",
    stable = 0;
  await expect
    .poll(async () => {
      const current = await sample();
      stable = current === previous ? stable + 1 : 0;
      previous = current;
      return stable;
    })
    .toBeGreaterThanOrEqual(3);
  const frozen = await sample();
  const frozenFrame = await galaxy.getAttribute("data-galaxy-frame");
  await page.mouse.move(400, 600);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await sample()).toBe(frozen);
  expect(await galaxy.getAttribute("data-galaxy-frame")).toBe(frozenFrame);
});

test("点击小屋可走近和轻摆，舒适模式停止环境动作", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "走近小屋", exact: true }).click();
  await expect(page.getByTestId("cottage-hub")).toHaveAttribute(
    "data-state",
    "room",
  );
  const bob = () =>
    page
      .locator(".cottage-bob")
      .evaluate((el) => getComputedStyle(el).transform);
  const initial = await bob();
  await expect.poll(bob).not.toBe(initial);
  await page.getByRole("button", { name: "轻触小屋", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".cottage-model")
        .evaluate((el) => el.getAnimations().length),
    )
    .toBeGreaterThan(0);
  await page
    .locator(".cottage-model")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wizards-gambit-session-v1"),
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("switch", { name: "减少动态效果" }).click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  expect(
    await page
      .locator(".cottage-bob")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "轻触小屋", exact: true }).click();
  expect(
    await page
      .locator(".cottage-model")
      .evaluate((el) => el.getAnimations().length),
  ).toBe(0);
});

test("三种比例聊天都有完整镜面，人物和对白互不覆盖并能改变表情", async ({
  page,
}) => {
  // Reset only this test's isolated browser storage at each viewport navigation.
  await page.addInitScript(() => localStorage.clear());
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "走近小屋", exact: true }).click();
    await page
      .getByRole("button", { name: "和马尔福聊聊", exact: true })
      .click();
    const mirror = page
      .locator(".hub-character")
      .getByTestId("full-length-mirror");
    await expect(mirror).toBeVisible();
    expect(
      await mirror.evaluate((el) => getComputedStyle(el).backgroundImage),
    ).toContain("enchanted-mirror-v5");
    await mirror
      .locator("img")
      .evaluate((img) => (img as HTMLImageElement).decode());
    const reflection = mirror.locator(".enchanted-reflection");
    const body = await reflection.boundingBox();
    const frame = await mirror.boundingBox();
    expect(Math.abs(frame!.width / frame!.height - 2 / 3)).toBeLessThan(0.01);
    const dialogue = await page.locator(".hub-dialogue").boundingBox();
    for (const button of await page
      .locator(".conversation-choices button")
      .all()) {
      const rect = (await button.boundingBox())!;
      expect(rect.y + rect.height).toBeLessThanOrEqual(
        dialogue!.y + dialogue!.height - 4,
      );
      expect(rect.x).toBeGreaterThanOrEqual(dialogue!.x);
      expect(rect.x + rect.width).toBeLessThanOrEqual(
        dialogue!.x + dialogue!.width,
      );
    }
    expect(body!.height).toBeGreaterThan(
      viewport.width > viewport.height && viewport.height < 600 ? 160 : 240,
    );
    expect(body!.y).toBeGreaterThan(frame!.y);
    expect(body!.y + body!.height).toBeLessThan(frame!.y + frame!.height);
    expect(
      body!.y + body!.height <= dialogue!.y ||
        body!.x + body!.width <= dialogue!.x,
    ).toBe(true);
    let before = await reflection.screenshot({ animations: "disabled" });
    let expression = await reflection
      .getByTestId("outfit-sprite")
      .getAttribute("data-expression");
    // v7 ties each response to an expression. A full cycle can return to the
    // first image, but adjacent clicks must change the actual painted figure.
    for (let tap = 0; tap < 8; tap++) {
      await page.locator(".hub-character").click();
      await expect(reflection.getByTestId("outfit-sprite")).not.toHaveAttribute(
        "data-expression",
        expression!,
      );
      await mirror
        .locator("img")
        .evaluate((img) => (img as HTMLImageElement).decode());
      const after = await reflection.screenshot({ animations: "disabled" });
      expect(after.equals(before)).toBe(false);
      before = after;
      expression = await reflection
        .getByTestId("outfit-sprite")
        .getAttribute("data-expression");
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await page.getByRole("button", { name: "收起聊天", exact: true }).click();
  }
});

test("手机头像常驻，工具栏和手牌都不遮住棋格", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "进入游戏", exact: true }).click();
  await page
    .locator(".cottage-stage")
    .evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      ),
    );
  const chessLabel = await page.locator(".chess-hotspot > span").boundingBox();
  const talkLabel = await page.locator(".malfoy-hotspot > span").boundingBox();
  expect(chessLabel!.x + chessLabel!.width).toBeLessThan(talkLabel!.x);
  await page.getByRole("button", { name: "和马尔福聊聊", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "与马尔福交谈" }),
  ).toBeVisible();
  await expect(page.locator(".chess-hotspot")).toBeHidden();
  await openTable(page);
  await page.getByRole("button", { name: /同机双人/ }).click();
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  const avatar = page.getByRole("button", { name: "展开魔镜", exact: true });
  await expect(avatar.locator(".mobile-companion-face")).toBeVisible();
  await expect(avatar.locator("small")).toHaveText("待落子");
  expect(
    await avatar
      .locator("small")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  const toolbar = await page.locator(".game-toolbar").boundingBox();
  const board = await page.getByTestId("board-2d").boundingBox();
  const turn = await page.locator(".turn-bar").boundingBox();
  expect(toolbar!.y + toolbar!.height).toBeLessThan(board!.y);
  expect(board!.y + board!.height).toBeLessThanOrEqual(turn!.y);
  await page.getByRole("button", { name: "e2 白兵", exact: true }).click();
  await expect(avatar.locator("small")).toHaveText("e2选好");
  await page.getByRole("button", { name: /e4 空格/ }).click();
  await expect(avatar.locator("small")).toHaveText("待交接");
  await page.getByRole("button", { name: /我已接手/ }).click();
  await expect(avatar.locator("small")).toHaveText("有棋谱");
  await page.reload();
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  // Resuming a same-device game asks the player to take over again so that
  // the other player's hidden cards cannot be exposed by a refresh.
  await expect(avatar.locator("small")).toHaveText("待交接");
  await expect(page.locator(".hand-cards .spell-card")).toHaveCount(0);
  await page.getByRole("button", { name: /我已接手/ }).click();
  await expect(avatar.locator("small")).toHaveText("有棋谱");
  await expect(avatar.locator("small")).toHaveAttribute(
    "title",
    "刚才 · 兵 e2 → e4",
  );
  await avatar.click();
  await expect(page.getByTestId("mirror-companion")).toBeVisible();
  const mirrorFrame = await page
    .getByTestId("full-length-mirror")
    .boundingBox();
  expect(
    Math.abs(mirrorFrame!.width / mirrorFrame!.height - 2 / 3),
  ).toBeLessThan(0.01);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("手机横屏棋格至少30像素，三张手牌完整且能走棋", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.getByRole("button", { name: "进入游戏", exact: true }).click();
  await page
    .locator(".cottage-stage")
    .evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      ),
    );
  const chessLabel = await page.locator(".chess-hotspot > span").boundingBox();
  const talkLabel = await page.locator(".malfoy-hotspot > span").boundingBox();
  expect(chessLabel!.x + chessLabel!.width).toBeLessThan(talkLabel!.x);
  await openTable(page);
  await page.getByRole("button", { name: /同机双人/ }).click();
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  const square = await page
    .getByRole("button", { name: "e2 白兵", exact: true })
    .boundingBox();
  expect(square!.width).toBeGreaterThanOrEqual(30);
  expect(square!.height).toBeGreaterThanOrEqual(30);
  for (const card of await page.locator(".spell-card").all()) {
    const box = await card.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(390);
  }
  await page.getByRole("button", { name: "e2 白兵", exact: true }).click();
  await page.getByRole("button", { name: /e4 空格/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await expect(
    page.getByRole("button", { name: "e4 白兵", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("mirror-companion")).toBeVisible();
});
