import { openTable } from "./navigation";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { PerspectiveCamera, Vector3 } from "three";

async function projected3D(page: Page, square: string, height = 0.125) {
  const box = await page.locator(".three-host canvas").boundingBox();
  if (!box) throw new Error("棋盘画布不可用");
  const camera = new PerspectiveCamera(43, box.width / box.height, 0.1, 100);
  camera.position.set(10, 12, 17);
  camera.lookAt(1.5, -0.2, 0);
  camera.updateMatrixWorld();
  const p = new Vector3(
    "abcdefgh".indexOf(square[0]) - 3.5,
    height,
    8 - Number(square[1]) - 3.5,
  ).project(camera);
  return {
    x: box.x + ((p.x + 1) * box.width) / 2,
    y: box.y + ((1 - p.y) * box.height) / 2,
  };
}
async function click3D(page: Page, square: string, height = 0.125) {
  const p = await projected3D(page, square, height);
  await page.mouse.click(p.x, p.y);
}

async function shot(page: Page, name: string) {
  await mkdir(".local/qa", { recursive: true });
  await page.screenshot({ path: `.local/qa/${name}.png`, fullPage: true });
}
async function expectMirrorPortraitVisible(page: Page) {
  // Measure the actual character viewport, not bright metal on the new frame.
  const portrait = page.locator(".mirror-character .outfit-sprite");
  await portrait
    .locator("img")
    .evaluate((el) => (el as HTMLImageElement).decode());
  // Inspect the composed pixels: DOM visibility alone cannot detect an opaque
  // decorative SVG painted over a successfully loaded character image.
  const screenshot = await portrait.screenshot({ animations: "disabled" });
  const visibleFace = await page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(
      Math.floor(image.width * 0.2),
      Math.floor(image.height * 0.03),
      Math.floor(image.width * 0.6),
      Math.floor(image.height * 0.27),
    ).data;
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] > 150 && pixels[i + 1] > 140 && pixels[i + 2] > 120)
        bright++;
    return bright / (pixels.length / 4);
  }, screenshot.toString("base64"));
  expect(
    visibleFace,
    "魔镜应显示人物的脸与浅色头发，雕花不能遮住镜面",
  ).toBeGreaterThan(0.15);
}
async function expectFlatBoardPainted(page: Page) {
  for (const square of ["e3", "e6"]) {
    const tile = page.locator(`[data-square=${square}]`);
    const expected = await tile.evaluate((el) =>
      getComputedStyle(el)
        .backgroundColor.match(/\d+/g)!
        .slice(0, 3)
        .map(Number),
    );
    const png = await tile.screenshot();
    const actual = await page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(
        Math.floor(image.width / 4),
        Math.floor(image.height / 4),
        8,
        8,
      ).data;
      const rgb = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 4)
        for (let channel = 0; channel < 3; channel++)
          rgb[channel] += pixels[i + channel] / (pixels.length / 4);
      return rgb;
    }, png.toString("base64"));
    for (let channel = 0; channel < 3; channel++)
      expect(
        Math.abs(actual[channel] - expected[channel]),
        "2D 棋格实际像素应匹配背景，不能被残留画布黑块或噪点遮挡",
      ).toBeLessThan(12);
  }
}
async function localGame(page: Page, classic = false) {
  await page.goto("/");
  await openTable(page);
  await page.getByRole("button", { name: /同机双人/ }).click();
  if (classic) await page.getByRole("button", { name: /经典巫师棋/ }).click();
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
}

test("主界面素材加载、立绘点击逐级害羞、刷新保留互动", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /巫师棋：与马尔福的甜蜜生活/ }),
  ).toBeVisible();
  await page
    .locator(".cottage-art")
    .evaluate((el) => (el as HTMLImageElement).decode());
  await shot(page, "desktop-home");
  const portrait = page.getByTestId("malfoy-portrait");
  for (let i = 1; i <= 15; i++) {
    await portrait.click();
    if ([1, 4, 8, 13].includes(i))
      await expect(portrait).toHaveAttribute(
        "data-stage",
        i === 1 ? "1" : i === 4 ? "2" : i === 8 ? "3" : "4",
      );
  }
  await expect(page.getByText("眼睛疼就歇一局。别硬撑。")).toBeVisible();
  await shot(page, "desktop-blush");
  await page.reload();
  await expect(page.getByTestId("malfoy-portrait")).toHaveAttribute(
    "data-stage",
    "4",
  );
  expect(errors).toEqual([]);
});

test("真实首章吃子、击毁演出、剧情推进及下一章施法", async ({ page }) => {
  await page.goto("/");
  await openTable(page);
  await page.getByRole("button", { name: /赴一场约棋/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "story-scene");
  await page.getByRole("button", { name: "稍后再读" }).click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByRole("button", { name: "a4 白城堡", exact: true }).click();
  await page.getByRole("button", { name: /a6 黑骑士/ }).click();
  await expect(page.getByTestId("capture-feedback")).toBeVisible();
  await page.screenshot({
    path: ".local/qa/capture-feedback.png",
    fullPage: true,
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  while (
    await page.getByRole("button", { name: "继续", exact: true }).isVisible()
  )
    await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.getByRole("button", { name: "下一次约棋" }).click();
  await page.getByRole("button", { name: /CHAPTER 02/ }).click();
  await page.getByRole("button", { name: "稍后再读" }).click();
  await page.getByRole("button", { name: /盔甲护身 防御/ }).click();
  await page.getByRole("button", { name: /f2 白兵/ }).click();
  await page.getByRole("button", { name: "施放", exact: true }).click();
  await expect(
    page.getByText("魔法已施放 · 现在走棋", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "d4 白城堡", exact: true }).click();
  await page.getByRole("button", { name: /d5 黑骑士/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("同机交接隐藏手牌，双方能够轮流走棋", async ({ page }) => {
  await localGame(page);
  await page.getByRole("button", { name: "和她聊聊", exact: true }).click();
  await expect(
    page.getByText("看我做什么？杯子都快空了。", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".hand-cards .spell-card")).toHaveCount(3);
  await page.getByRole("button", { name: "e2 白兵", exact: true }).click();
  await page.getByRole("button", { name: /e4 空格/ }).click();
  await expect(page.getByRole("dialog", { name: "交接回合" })).toBeVisible();
  await expect(page.locator(".hand-cards .spell-card")).toHaveCount(0);
  await shot(page, "handover");
  await page.getByRole("button", { name: /我已接手/ }).click();
  await expect(page.locator(".hand-cards .spell-card")).toHaveCount(3);
  await page.getByRole("button", { name: "e7 黑兵", exact: true }).click();
  await page.getByRole("button", { name: /e5 空格/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await expect(
    page.getByRole("button", { name: "e5 黑兵", exact: true }),
  ).toBeVisible();
  await shot(page, "desktop-2d");
});

test("3D WebGL 成功渲染且视图切换保留对局", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await localGame(page, true);
  await page.getByRole("button", { name: "e2 白兵", exact: true }).click();
  await page.getByRole("button", { name: /e4 空格/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator(".three-host canvas")).toBeVisible();
  await page.waitForTimeout(900);
  await click3D(page, "e7");
  await click3D(page, "e5");
  await page.getByRole("button", { name: /我已接手/ }).click();
  await page.waitForTimeout(400);
  await shot(page, "desktop-3d");
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "e4 白兵", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "e2 空格", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "e5 黑兵", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("3D 鼠标实际选子与击毁，碎片演出后再进入结局", async ({ page }) => {
  await page.goto("/");
  await openTable(page);
  await page.getByRole("button", { name: /赴一场约棋/ }).click();
  await page.getByRole("button", { name: "稍后再读" }).click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator(".three-host canvas")).toBeVisible();
  await page.waitForTimeout(700);
  await click3D(page, "a4", 0.8);
  await click3D(page, "a6", 0.8);
  await page.waitForTimeout(430);
  await shot(page, "capture-3d");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("自由相机旋转缩放与复位，拖回起点不误落子，魔镜不锁棋", async ({
  page,
}) => {
  // Several real WebGL gestures, resets, a move, and composed-pixel checks
  // run through the software renderer/compositor on this Windows host.
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await localGame(page, true);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const board = page.getByTestId("board-3d");
  await expectMirrorPortraitVisible(page);
  await expect(board).toHaveAttribute(
    "data-camera-pose",
    "10.000,12.000,17.000",
  );
  const box = await page.locator(".three-host canvas").boundingBox();
  if (!box) throw Error("画布未显示");
  await click3D(page, "e2");
  const { x, y } = await projected3D(page, "e4");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 160, y + 30, { steps: 4 });
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("wizards-gambit-session-v1")!).state
            .history.length,
      ),
    )
    .toBe(0);
  await expect
    .poll(() => board.getAttribute("data-camera-pose"))
    .not.toBe("10.000,12.000,17.000");
  await page.getByRole("button", { name: "复位战术镜头" }).click();
  await expect(board).toHaveAttribute(
    "data-camera-pose",
    "10.000,12.000,17.000",
  );
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 140, y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const rotated = await board.getAttribute("data-camera-pose");
  expect(rotated).not.toBe("10.000,12.000,17.000");
  await page.waitForTimeout(500);
  expect(await board.getAttribute("data-camera-pose")).not.toBe(
    "10.000,12.000,17.000",
  );
  await page.mouse.wheel(0, -250);
  await expect
    .poll(() => board.getAttribute("data-camera-pose"))
    .not.toBe(rotated);
  await shot(page, "v3-dorm-orbit");
  await page.getByRole("button", { name: "复位战术镜头" }).click();
  await expect(board).toHaveAttribute(
    "data-camera-pose",
    "10.000,12.000,17.000",
  );
  await page.getByTestId("malfoy-portrait").click();
  await expect(page.getByTestId("mirror-companion")).toContainText(
    "波特，棋盘在那边。你碰我的袖子做什么？",
  );
  await expect(
    page.getByRole("button", { name: "e2 白兵", exact: true }),
  ).toBeEnabled();
  // The pawn selected before the out-and-back drag must still be selected.
  await click3D(page, "e4");
  await expect(page.getByRole("dialog", { name: "交接回合" })).toBeVisible();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByTestId("mirror-companion")).toBeVisible();
  await expectMirrorPortraitVisible(page);
  await expect(
    page.getByRole("button", { name: "e4 白兵", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("board-3d")).toHaveCount(0);
  await expectFlatBoardPainted(page);
  await shot(page, "v3-mirror-2d");
  expect(errors).toEqual([]);
});

test("画廊六张CG和四张立绘载入，装束选择刷新保留", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /回忆画廊/ }).click();
  await expect(page.locator(".gallery-thumbs button")).toHaveCount(10);
  for (let i = 1; i <= 10; i++) {
    await page
      .getByRole("button", { name: `查看回忆${i}`, exact: true })
      .click();
    await page
      .locator(".gallery-feature img")
      .evaluate((el) => (el as HTMLImageElement).decode());
    expect(
      await page
        .locator(".gallery-feature img")
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(1000);
  }
  await shot(page, "v2-gallery");
  await page.getByRole("button", { name: "翡翠晚宴", exact: true }).click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "和马尔福聊聊", exact: true }).click();
  await expect(page.locator("[data-testid=outfit-sprite] img")).toHaveAttribute(
    "src",
    /gala/,
  );
  await page.reload();
  await page.getByRole("button", { name: "和马尔福聊聊", exact: true }).click();
  await expect(page.locator("[data-testid=outfit-sprite] img")).toHaveAttribute(
    "src",
    /gala/,
  );
});

test("手机横屏菜单与棋盘可操作，2D的64格等宽等高", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await localGame(page, true);
  const squares = await page.locator(".flat-square").evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  expect(squares).toHaveLength(64);
  for (const square of squares)
    expect(Math.abs(square.width - square.height)).toBeLessThan(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(844);
  await page.getByRole("button", { name: "e2 白兵", exact: true }).click();
  await page.getByRole("button", { name: /e4 空格/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await shot(page, "v2-mobile-landscape");
});

test("损坏的本机档保留原件，提供恢复入口和独立访客游玩", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem(
      "wizards-gambit-session-v1",
      '{"state":{"schema":1,"board":[null]}}',
    );
    localStorage.setItem("wizards-gambit-settings-v1", "null");
    localStorage.setItem("wizards-gambit-progress-v1", "null");
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("本机进度异常");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wizards-gambit-progress-v1"),
    ),
  ).toBe("null");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wizards-gambit-session-v1"),
    ),
  ).toBe('{"state":{"schema":1,"board":[null]}}');
  await expect(
    page.getByRole("button", { name: "导出原本机档原件" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "使用本机访客存档" }).click();
  await expect(
    page.getByRole("heading", { name: /巫师棋：与马尔福的甜蜜生活/ }),
  ).toBeVisible();
  await page.getByTestId("malfoy-portrait").click();
  expect(errors).toEqual([]);
});

test("人机 Worker 能实际完成黑方回应", async ({ page }) => {
  await page.goto("/");
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
});

test("两个独立浏览器上下文能加入好友房间并恢复座位（本机网络）", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const pa = await a.newPage(),
    pb = await b.newPage();
  try {
    await pa.goto("http://127.0.0.1:8788/");
    await openTable(pa);
    await pa.getByRole("button", { name: /好友联网/ }).click();
    await pa.getByRole("button", { name: /为我们留一间棋室/ }).click();
    const code = (await pa.locator(".room-code").innerText()).trim();
    await pb.goto("http://127.0.0.1:8788/");
    await openTable(pb);
    await pb.getByRole("button", { name: /好友联网/ }).click();
    await pb.getByLabel("六位房间码").fill(code);
    await pb.getByRole("button", { name: "加入棋室", exact: true }).click();
    await pa.getByRole("button", { name: "我准备好了" }).click();
    await pb.getByRole("button", { name: "我准备好了" }).click();
    await pa.getByRole("button", { name: "2D", exact: true }).click();
    await pb.getByRole("button", { name: "2D", exact: true }).click();
    await pa.getByRole("button", { name: "e2 白兵", exact: true }).click();
    await pa.getByRole("button", { name: /e4 空格/ }).click();
    await expect(
      pb.getByRole("button", { name: "e4 白兵", exact: true }),
    ).toBeVisible();
    await pb.getByRole("button", { name: "e7 黑兵", exact: true }).click();
    await pb.getByRole("button", { name: /e5 空格/ }).click();
    await expect(
      pa.getByRole("button", { name: "e5 黑兵", exact: true }),
    ).toBeVisible();
    await shot(pa, "friend-room");
    await pb.reload();
    await openTable(pb);
    await pb.getByRole("button", { name: /好友联网/ }).click();
    await pb.getByRole("button", { name: /恢复上次的好友座位/ }).click();
    await expect(
      pb.getByRole("button", { name: "e5 黑兵", exact: true }),
    ).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});

test("手机布局、立绘点击、平面棋盘和模态窗不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByTestId("malfoy-portrait").click();
  await page.locator(".hub-conversation").evaluate(async (el) => {
    await Promise.all(
      el.getAnimations().map((animation) => animation.finished),
    );
  });
  const homeBounds = await page
    .locator(".hub-dialogue, .cottage-shortcuts")
    .evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    );
  for (const rect of homeBounds) {
    expect(
      rect.left,
      "点击人物后主菜单和对白左缘仍应在屏幕内",
    ).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(375);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await shot(page, "mobile-home");
  await openTable(page);
  await page.getByRole("button", { name: /同机双人/ }).click();
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByTestId("board-2d")).toBeVisible();
  const squares = await page.locator(".flat-square").evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  expect(squares).toHaveLength(64);
  for (const square of squares)
    expect(Math.abs(square.width - square.height)).toBeLessThan(1);
  const turn = await page.locator(".turn-bar").boundingBox();
  const cards = await page
    .locator(".hand-cards .spell-card")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(turn).not.toBeNull();
  expect(cards).toHaveLength(3);
  expect(
    turn!.y + turn!.height,
    "回合状态不能与实际手牌图像相交",
  ).toBeLessThanOrEqual(Math.min(...cards));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await shot(page, "mobile-game");
  await page.getByRole("button", { name: "展开魔镜", exact: true }).click();
  await expectMirrorPortraitVisible(page);
  await shot(page, "v3-mobile-mirror");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("switch", { name: "减少动态效果" }).click();
  await expect(
    page.getByRole("switch", { name: "减少动态效果" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("本机排行榜来源明确，魔法图鉴列出24张卡", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "排行榜", exact: true }).click();
  await expect(page.getByText("本机纪录 · 当前浏览器")).toBeVisible();
  await expect(page.getByText("还没有试炼纪录。")).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "魔法图鉴", exact: true }).click();
  await expect(page.locator(".library-card")).toHaveCount(24);
});
