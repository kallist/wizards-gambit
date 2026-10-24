import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { startLocalGame } from "../scripts/play-local.mjs";

test("local launcher reuses the running game and keeps the localhost origin", async () => {
  const first = await startLocalGame({ port: 0, open: false });
  try {
    assert.equal(new URL(first.url).hostname, "localhost");
    const second = await startLocalGame({
      port: Number(new URL(first.url).port),
      open: false,
    });
    assert.equal(second.reused, true);
    assert.equal(second.url, first.url);
    await second.close();
    assert.equal((await fetch(first.url)).status, 200);
  } finally {
    await first.close();
  }
});

test("an unrelated service is preserved and never triggers a different port", async () => {
  const foreign = createServer((req, res) => {
    res.end(req.url === "/api/health" ? '{"ok":true}' : "another project");
  });
  await new Promise((done) => foreign.listen(0, "127.0.0.1", done));
  const port = foreign.address().port;
  try {
    await assert.rejects(
      startLocalGame({ port, open: false }),
      /被其他程序占用/,
    );
    assert.equal(
      await (await fetch(`http://localhost:${port}/`)).text(),
      "another project",
    );
  } finally {
    await new Promise((done) => foreign.close(done));
  }
});

test("file entries explain startup; the HTTP game runs a real Worker reply", async () => {
  const browser = await chromium.launch({
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-compositing",
    ],
  });
  const game = await startLocalGame({ port: 0, open: false });
  try {
    const page = await browser.newPage();
    for (const file of ["index.html", "dist/index.html"]) {
      await page.goto(pathToFileURL(resolve(file)).href);
      await expect(
        page.getByRole("heading", { name: "请先启动游戏" }),
      ).toBeVisible();
      await expect(
        page.getByText("“开始游戏.cmd”", { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("link")).toHaveAttribute(
        "href",
        "http://localhost:8787/",
      );
    }
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(game.url);
    await page
      .getByRole("button", { name: /今晚棋旅/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "和你一起出发", exact: true })
      .click();
    await expect(page.getByTestId("board-2d")).toBeVisible();
    await page.locator('[data-square="e5"]').click();
    await page.locator('[data-square="e6"]').click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const s = JSON.parse(
              localStorage.getItem("wizards-gambit-journey-v1"),
            );
            return s?.activeRun?.game?.history.length;
          }),
        { timeout: 20000 },
      )
      .toBe(2);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await game.close();
  }
});
