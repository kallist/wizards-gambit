import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createGame } from "../../src/domain/engine";
import { initialJourneyProgress, reduceJourney } from "../../src/journey/model";

const output = ".local/v12-implementation/sidebar-screens";
let memory = reduceJourney(initialJourneyProgress(), {
  type: "start",
  commandId: "sidebar_start",
  runId: "sidebar_night",
  preparation: "thread",
  seed: 28,
});
memory = reduceJourney(memory, { type: "abandon", commandId: "sidebar_home" });
memory = reduceJourney(memory, {
  type: "finishHome",
  keepsake: "cup-mark",
  commandId: "sidebar_keepsake",
});

for (const [width, height] of [
  [1308, 750],
  [1440, 900],
  [1366, 768],
  [390, 844],
  [360, 640],
  [844, 390],
  [667, 375],
]) {
  test(`left collection rail avoids invitations and keepsakes at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(
      ({ memory, game }) => {
        localStorage.setItem(
          "wizards-gambit-journey-v1",
          JSON.stringify(memory),
        );
        localStorage.setItem(
          "wizards-gambit-session-v1",
          JSON.stringify({
            mode: "local",
            chapter: 0,
            human: "white",
            difficulty: "gentle",
            matchId: "sidebar:ordinary",
            state: game,
          }),
        );
      },
      { memory, game: createGame("classic", 528) },
    );
    await page.goto("/");
    const rail = page.getByRole("navigation", { name: "小屋收藏" });
    await expect(rail.getByRole("button")).toHaveCount(4);
    const check = async () => {
      const buttons = await rail.getByRole("button").all();
      let lastBottom = 0;
      for (const button of buttons) {
        await expect(button).toBeInViewport();
        const box = (await button.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.y).toBeGreaterThanOrEqual(lastBottom);
        lastBottom = box.y + box.height;
      }
      const overlap = await rail.evaluate((el) => {
        const a = el.getBoundingClientRect();
        return [
          ...document.querySelectorAll(
            ".cover-actions button,.cottage-title h1,.cottage-keepsake,.room-heading",
          ),
        ]
          .filter((e) => {
            const b = e.getBoundingClientRect();
            return (
              b.width > 0 &&
              b.height > 0 &&
              a.left < b.right &&
              a.right > b.left &&
              a.top < b.bottom &&
              a.bottom > b.top
            );
          })
          .map((e) => e.textContent);
      });
      expect(overlap).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    };
    await check();
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: `${output}/cover-${width}x${height}.png` });
    const invite = page.getByRole("button", { name: /今晚棋旅/ }).first();
    await invite.click();
    await expect(page.getByTestId("journey-screen")).toBeVisible();
    await page.getByRole("button", { name: "返回小屋", exact: true }).click();
    await check();
    await page.screenshot({ path: `${output}/room-${width}x${height}.png` });
    for (const name of ["衣装收藏", "故事手札", "回忆画廊", "魔法图鉴"]) {
      await rail.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "关闭", exact: true }).click();
    }
  });
}
