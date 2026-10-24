import { openTable } from "./navigation";
import { expect, test } from "@playwright/test";
import {
  OUTFITS,
  EXPRESSION_NAMES,
  ALL_OUTFITS,
} from "../../src/story/companion";
import { applyAction } from "../../src/domain/engine";

test("正常剧情目标解锁一套，刷新同局不重复，认输和退出不领奖", async ({
  page,
}) => {
  await page.goto("/");
  await openTable(page);
  await page.getByRole("button", { name: /赴一场约棋/ }).click();
  await page.getByRole("button", { name: "稍后再读" }).click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByRole("button", { name: "a4 白城堡", exact: true }).click();
  await page.getByRole("button", { name: /a6 黑骑士/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("wizards-gambit-companion-v1") ?? "null",
          )?.claimed.length,
      ),
    )
    .toBe(1);
  const before = await page.evaluate(() =>
    localStorage.getItem("wizards-gambit-companion-v1"),
  );
  const matchId = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("wizards-gambit-session-v1")!).matchId,
  );
  await page.reload();
  await page.getByRole("button", { name: /继续游戏/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("wizards-gambit-session-v1")!)
            .matchId,
      ),
    )
    .toBe(matchId);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("wizards-gambit-companion-v1")),
    )
    .toBe(before);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "六封冬日情书" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "返回小屋", exact: true }).click();
  await openTable(page);
  await page.getByRole("button", { name: /同机双人/ }).click();
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await page.getByRole("button", { name: "返回小屋", exact: true }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wizards-gambit-companion-v1"),
    ),
  ).toBe(before);
  // The engine supports resignation; this fixture verifies a restored resign
  // result rather than claiming a UI resignation control exists.
  const session = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("wizards-gambit-session-v1")!),
  );
  session.state = applyAction(session.state, { type: "resign" });
  await page.evaluate(
    (value) =>
      localStorage.setItem("wizards-gambit-session-v1", JSON.stringify(value)),
    session,
  );
  await page.reload();
  await page.getByRole("button", { name: /继续游戏/ }).click();
  await expect(page.getByRole("dialog")).toContainText("认输");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wizards-gambit-companion-v1"),
    ),
  ).toBe(before);
});

test("24套真实八差分与24张CG逐套解码", async ({ page }) => {
  // This inventory case performs 192 real expression selections and 24 CG opens.
  // Give these hundreds of UI actions a bounded budget.
  test.setTimeout(180000);
  // Fixture ownership makes the complete asset set inspectable. Unlocking is
  // separately exercised above through a real chapter action.
  await page.addInitScript(
    (owned) =>
      localStorage.setItem(
        "wizards-gambit-companion-v1",
        JSON.stringify({ schema: 1, owned, heart: 22, claimed: [] }),
      ),
    ALL_OUTFITS,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "衣装收藏", exact: true }).click();
  await expect(page.locator(".wardrobe-cards button")).toHaveCount(24);
  const sources = new Set<string>();
  for (const outfit of OUTFITS) {
    await page
      .getByRole("button", { name: `衣装 ${outfit.name} 已拥有`, exact: true })
      .click();
    for (const expression of EXPRESSION_NAMES) {
      await page.getByRole("button", { name: expression, exact: true }).click();
      await expect(
        page.locator(".wardrobe-preview [data-testid=outfit-sprite]"),
      ).toHaveAttribute(
        "data-expression",
        String(EXPRESSION_NAMES.indexOf(expression)),
      );
      await expect(
        page.locator(".wardrobe-preview [data-testid=outfit-sprite]"),
      ).toHaveAttribute("data-outfit", outfit.id);
      const img = page.locator(".wardrobe-preview img");
      await img.evaluate((el) => (el as HTMLImageElement).decode());
      expect(
        await img.evaluate((el) => (el as HTMLImageElement).naturalHeight),
      ).toBeGreaterThan(700);
      sources.add((await img.getAttribute("src"))!);
    }
    await page.getByRole("button", { name: "专属番外", exact: true }).click();
    await page
      .locator(".date-cg")
      .evaluate((el) => (el as HTMLImageElement).decode());
    expect(
      await page
        .locator(".date-cg")
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(1000);
    await expect(page.getByRole("dialog")).toContainText("1 / 24");
    await page.getByRole("button", { name: "关闭", exact: true }).click();
  }
  expect(sources.size).toBe(72);
  await page.screenshot({
    path: ".local/qa/v3-wardrobe-fixture.png",
    fullPage: true,
  });
});

test("番外两处选择生效，刷新恢复阅读位置且不改变心动", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "wizards-gambit-companion-v1",
      JSON.stringify({ schema: 1, owned: 3, heart: 22, claimed: [] }),
    ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "衣装收藏", exact: true }).click();
  await page
    .getByRole("button", { name: "衣装 绿银学院 已拥有", exact: true })
    .click();
  await page.getByRole("button", { name: "专属番外", exact: true }).click();
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "继续", exact: true }),
  ).toBeDisabled();
  await page.locator(".date-choices button").nth(1).click();
  await expect(page.locator(".date-copy")).toContainText(
    "……手给你。别一直伸着，怪傻的。",
  );
  while (!(await page.locator(".date-choices button").count()))
    await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.locator(".date-choices button").first().click();
  await expect(page.locator(".date-copy")).toContainText(
    "记住了。下次别说是我逼你答应的。",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "衣装收藏", exact: true }).click();
  await page.getByRole("button", { name: "专属番外", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("19 / 24");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("wizards-gambit-companion-v1")!).heart,
    ),
  ).toBe(22);
});

for (const viewport of [
  { width: 1392, height: 750 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`专属番外单幅CG读完24页返回衣橱且能重读 ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() =>
      localStorage.setItem(
        "wizards-gambit-companion-v1",
        JSON.stringify({
          schema: 1,
          owned: (1 << 24) - 1,
          heart: 22,
          claimed: [],
        }),
      ),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "衣装收藏", exact: true }).click();
    await page
      .getByRole("button", { name: "衣装 书页与星 已拥有", exact: true })
      .click();
    const collection = () =>
      page.evaluate(() => localStorage.getItem("wizards-gambit-companion-v1"));
    const initialCollection = await collection();
    await page.getByRole("button", { name: "专属番外", exact: true }).click();
    const story = page.getByTestId("outfit-story");
    // A single complete date illustration must be the only artwork in this scene.
    await expect(story.getByRole("img")).toHaveCount(1);
    await expect(story.getByRole("img")).toHaveAccessibleName(/专属约会CG/);
    await story
      .getByRole("img")
      .evaluate((img) => (img as HTMLImageElement).decode());
    for (let line = 0; line < 23; line++) {
      await expect(page.getByRole("dialog")).toContainText(`${line + 1} / 24`);
      if (line === 5 || line === 17) {
        await expect(
          page.getByRole("button", { name: "继续", exact: true }),
        ).toBeDisabled();
        if (line === 5)
          await page.screenshot({
            path: `.local/story-fix/${viewport.width}x${viewport.height}-choice.png`,
          });
        await page
          .locator(".date-choices button")
          .nth(line === 5 ? 1 : 0)
          .click();
      } else
        await page.getByRole("button", { name: "继续", exact: true }).click();
    }
    await expect(page.getByRole("dialog")).toContainText("24 / 24");
    await expect(page.locator(".date-copy")).toContainText("· 终。");
    await page.screenshot({
      path: `.local/story-fix/${viewport.width}x${viewport.height}-ending.png`,
    });
    for (const label of ["上一页", "从头阅读", "读完了"]) {
      const button = page.getByRole("button", { name: label, exact: true });
      await expect(button).toBeInViewport();
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
    await page.getByRole("button", { name: "读完了", exact: true }).click();
    await expect(story).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: "她的私人衣橱" }),
    ).toBeVisible();
    expect(await collection()).toBe(initialCollection);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("wizards-gambit-session-v1"),
      ),
    ).toBeNull();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("wizards-gambit-dates-v1")!).scholar,
      ),
    ).toEqual({ line: 23, choices: [1, 0], updatedAt: expect.any(Number) });
    // Returning to the wardrobe restores the equipped outfit's preview.
    await page
      .getByRole("button", { name: "衣装 书页与星 已拥有", exact: true })
      .click();
    await page.getByRole("button", { name: "专属番外", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("24 / 24");
    await page.getByRole("button", { name: "从头阅读", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("1 / 24");
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("wizards-gambit-dates-v1")!).scholar,
      ),
    ).toEqual({
      line: 0,
      choices: [null, null],
      updatedAt: expect.any(Number),
    });
  });
}

test("番外阅读存储不可写时提示未保存，仍能读完返回衣橱", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "wizards-gambit-dates-v1",
      JSON.stringify({ college: { line: 23, choices: [0, 1] } }),
    );
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "wizards-gambit-dates-v1")
        throw new DOMException("Quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "衣装收藏", exact: true }).click();
  await page.getByRole("button", { name: "专属番外", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("24 / 24");
  await expect(page.getByTestId("outfit-story")).toContainText(
    "阅读位置尚未保存",
  );
  await page.getByRole("button", { name: "读完了", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "她的私人衣橱" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("wizards-gambit-dates-v1")!).college,
    ),
  ).toEqual({ line: 23, choices: [0, 1] });
});

test("手机魔镜可展开收起，衣柜与番外保持屏幕内", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openTable(page);
  await page.getByRole("button", { name: /同机双人/ }).click();
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await page.getByRole("button", { name: /我已接手/ }).click();
  await page.getByRole("button", { name: "展开魔镜", exact: true }).click();
  await expect(page.getByTestId("mirror-companion")).toBeVisible();
  await page.getByTestId("malfoy-portrait").click();
  await page.getByRole("button", { name: "衣装收藏", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "她的私人衣橱" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "温柔", exact: true }).click();
  await page.getByRole("button", { name: "专属番外", exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: ".local/qa/v3-mobile-date.png",
    fullPage: true,
  });
});
