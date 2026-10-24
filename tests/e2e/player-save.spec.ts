import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { createGame, applyAction } from "../../src/domain/engine";
import { openTable } from "./navigation";
import { initialJourneyProgress } from "../../src/journey/model";

// Each test owns its mock account service and isolated Chromium storage contexts.
// No production player data or Bilibili credentials are used.
function service() {
  return {
    accounts: {} as Record<string, Record<string, string>>,
    writes: [] as { account: string; items: Record<string, string> }[],
    offline: false,
    profileMissing: false,
  };
}
type Service = ReturnType<typeof service>;
async function install(context: BrowserContext, state: Service) {
  await context.exposeFunction(
    "saveTestRPC",
    async (
      account: string,
      operation: string,
      payload?: Record<string, string> | string[],
    ) => {
      if (operation === "profile")
        return {
          nickname: "测试玩家",
          avatar: "",
          ...(state.profileMissing
            ? {}
            : { toyOpenId: `test-openid-${account}` }),
        };
      if (state.offline) throw new Error("隔离测试：网络离线");
      const cloud = (state.accounts[account] ??= {});
      if (operation === "get")
        return Object.fromEntries(
          Object.entries(cloud).filter(
            ([k]) =>
              !Array.isArray(payload) || !payload.length || payload.includes(k),
          ),
        );
      if (operation === "set") {
        const items = payload as Record<string, string>;
        expect(Object.keys({ ...cloud, ...items }).length).toBeLessThanOrEqual(
          128,
        );
        for (const [k, v] of Object.entries(items)) {
          expect(k).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
          expect(Buffer.byteLength(v)).toBeLessThanOrEqual(1024);
        }
        Object.assign(cloud, items);
        state.writes.push({ account, items });
        return;
      }
      if (operation === "remove")
        for (const k of payload as string[]) delete cloud[k];
    },
  );
  await context.addInitScript(() => {
    const w = window as any;
    try {
      w.saveTestAccount = sessionStorage.getItem("test-account") ?? "A";
    } catch {
      w.saveTestAccount = "A";
    }
    const rpc = (operation: string, payload?: unknown) =>
      w.saveTestRPC(w.saveTestAccount, operation, payload);
    w.toy = {
      getUserProfile: () => rpc("profile"),
      getCloudStorage: (keys?: string[]) => rpc("get", keys),
      setCloudStorage: (items: unknown) => rpc("set", items),
      removeCloudStorage: (keys: string[]) => rpc("remove", keys),
      isSupport: async () => true,
      getRankList: async () => [],
      getMyRank: async () => ({ ranked: false }),
      submitScore: async ({ score }: { score: number }) => ({ score }),
    };
  });
}
const owner = (account = "A") =>
  createHash("sha256").update(`test-openid-${account}`).digest("hex");
const physical = (key: string, account = "A") =>
  `wg-player-v2-${owner(account)}:wizards-gambit-${key}-v1`;
async function connect(page: Page) {
  await page.getByRole("button", { name: "连接B站存档", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /巫师棋：与马尔福/ }),
  ).toBeVisible();
}
async function settings(page: Page) {
  const handover = page.getByRole("button", { name: /我已接手/ });
  if (await handover.isVisible()) await handover.click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
}
async function close(page: Page) {
  await page.getByRole("button", { name: "关闭", exact: true }).click();
}
async function collection(page: Page, account = "A") {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    physical("companion", account),
  );
}
function original() {
  return {
    progress: { schema: 1, unlocked: 6, chapter: 5, taps: 40, best: 1300 },
    companion: {
      schema: 1,
      owned: 0xffffff,
      heart: 72,
      claimed: ["match:original"],
    },
    dates: { college: { line: 7, choices: [1, null], updatedAt: 12345 } },
    settings: {
      view: "2d",
      comfort: true,
      outfit: "college",
      musicVolume: 0.5,
    },
    session: {
      mode: "local",
      chapter: 0,
      human: "white",
      difficulty: "gentle",
      matchId: "local:original",
      state: applyAction(createGame("classic", 145), {
        type: "move",
        move: { from: 52, to: 36 },
      }),
    },
  };
}
async function seedOriginal(page: Page) {
  await page.addInitScript((data) => {
    if (!localStorage.getItem("wizards-gambit-progress-v1"))
      for (const [k, v] of Object.entries(data))
        localStorage.setItem(`wizards-gambit-${k}-v1`, JSON.stringify(v));
    localStorage.setItem(
      "wizards-gambit-room-v1",
      JSON.stringify({ token: "test-room-private-token" }),
    );
  }, original());
}

for (const scope of ["local", "guest"] as const) {
  test(`${scope}两页正常通关后，旧页轻触不会回退已解锁章节`, async ({
    page,
    context,
  }) => {
    const sdk = service();
    if (scope === "guest") await install(context, sdk);
    const prefix = scope === "local" ? "" : "wg-player-v2-guest:";
    const key = `${prefix}wizards-gambit-progress-v1`;
    const enter = async (target: Page) => {
      await target.goto("/");
      if (scope === "guest")
        await target.getByRole("button", { name: "使用本机访客存档" }).click();
      await expect(target.getByTestId("cottage-hub")).toBeVisible();
    };
    await enter(page);
    const second = await context.newPage();
    // A delayed storage event must not be required for persistence correctness.
    await second.addInitScript(() =>
      window.addEventListener(
        "storage",
        (event) => event.stopImmediatePropagation(),
        true,
      ),
    );
    await enter(second);
    await openTable(page);
    await page.getByRole("button", { name: /赴一场约棋/ }).click();
    await page.getByRole("button", { name: "稍后再读" }).click();
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await page.getByRole("button", { name: "a4 白城堡", exact: true }).click();
    await page.getByRole("button", { name: /a6 黑骑士/ }).click();
    const progress = () =>
      page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
    await expect.poll(async () => (await progress()).unlocked).toBe(2);
    await second.getByTestId("malfoy-portrait").click();
    await expect.poll(async () => (await progress()).taps).toBe(1);
    expect(await progress()).toMatchObject({
      unlocked: 2,
      chapter: 1,
      taps: 1,
    });
    expect(sdk.writes).toEqual([]);
  });

  test(`${scope}缺少Web Locks时使用可导出的隔离内存会话，不改原持久档`, async ({
    page,
    context,
  }, testInfo) => {
    const sdk = service();
    if (scope === "guest") await install(context, sdk);
    const prefix = scope === "local" ? "" : "wg-player-v2-guest:";
    const key = `${prefix}wizards-gambit-progress-v1`;
    const data = original();
    data.progress = { schema: 1, unlocked: 1, chapter: 0, taps: 3, best: 0 };
    data.companion = { schema: 1, owned: 3, heart: 3, claimed: [] };
    await context.addInitScript(
      ({ key, prefix, data }) => {
        Object.defineProperty(navigator, "locks", {
          value: undefined,
          configurable: true,
        });
        if (!localStorage.getItem(key)) {
          for (const [name, value] of Object.entries(data))
            localStorage.setItem(
              `${prefix}wizards-gambit-${name}-v1`,
              JSON.stringify(value),
            );
          localStorage.setItem(
            `${prefix}wizards-gambit-room-v1`,
            JSON.stringify({ token: "test-private-room-token" }),
          );
        }
      },
      { key, prefix, data },
    );
    const enter = async (target: Page) => {
      await target.goto("/");
      if (scope === "guest")
        await target.getByRole("button", { name: "使用本机访客存档" }).click();
      await expect(target.getByTestId("cottage-hub")).toBeVisible();
    };
    await enter(page);
    await expect(
      page.getByRole("note", { name: "临时存档提示" }),
    ).toContainText("刷新或关闭页面会丢失");
    await page.screenshot({
      path: testInfo.outputPath("temporary-entry.png"),
      fullPage: true,
    });
    const before = await page.evaluate(() => ({ ...localStorage }));
    const second = await context.newPage();
    await enter(second);
    await page.getByTestId("malfoy-portrait").click();
    await expect(page.getByTestId("malfoy-portrait")).toHaveAttribute(
      "data-stage",
      "2",
    );
    await settings(page);
    await expect(page.getByRole("status")).toContainText("隔离临时游玩");
    await expect(page.getByRole("status")).toContainText(
      "刷新或关闭页面会丢失",
    );
    await page.getByRole("switch", { name: "减少动态效果" }).click();
    await page.getByRole("slider", { name: "配乐音量" }).fill("0.75");
    await close(page);
    await openTable(page);
    await page.getByRole("button", { name: /继续游戏/ }).click();
    const handover = page.getByRole("button", { name: /我已接手/ });
    if (await handover.isVisible()) await handover.click();
    await page.getByRole("button", { name: "e7 黑兵", exact: true }).click();
    await page.getByRole("button", { name: /^e5 空格/ }).click();
    await settings(page);
    const exported = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "导出备份文件", exact: true })
      .click();
    const backup = JSON.parse(
      await readFile((await (await exported).path())!, "utf8"),
    );
    expect(backup.save.progress.taps).toBe(4);
    expect(backup.save.companion.heart).toBe(4);
    expect(backup.save.session.state.history).toHaveLength(2);
    expect(backup.save.settings).toMatchObject({
      comfort: false,
      musicVolume: 0.75,
    });
    expect(backup.save.dates).toEqual(data.dates);
    expect(JSON.stringify(backup)).not.toContain("test-private-room-token");
    await expect(second.getByTestId("malfoy-portrait")).toHaveAttribute(
      "data-stage",
      "1",
    );
    const originalDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "导出原持久档原件", exact: true })
      .click();
    const originalFile = JSON.parse(
      await readFile((await (await originalDownload).path())!, "utf8"),
    );
    expect(
      JSON.parse(originalFile.data["wizards-gambit-progress-v1"]).taps,
    ).toBe(3);
    expect(Object.values(originalFile.data).join()).not.toContain(
      "test-private-room-token",
    );
    // Explicit import/rollback operates on this temporary adapter as well.
    await page.getByLabel("选择存档备份文件").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          ...backup,
          save: {
            ...backup.save,
            progress: { ...backup.save.progress, taps: 40 },
          },
        }),
      ),
    });
    await settings(page);
    await page
      .getByRole("button", { name: "恢复合并前的本机备份", exact: true })
      .click();
    await settings(page);
    const rolledBack = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "导出备份文件", exact: true })
      .click();
    expect(
      JSON.parse(await readFile((await (await rolledBack).path())!, "utf8"))
        .save.progress.taps,
    ).toBe(4);
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
    expect(sdk.writes).toEqual([]);
    await page.reload();
    if (scope === "guest")
      await page.getByRole("button", { name: "使用本机访客存档" }).click();
    await expect(page.getByTestId("malfoy-portrait")).toHaveAttribute(
      "data-stage",
      "1",
    );
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  });
}

test("无锁时禁止账号云写；损坏访客档只能在临时副本中修复，原件保留", async ({
  page,
  context,
}) => {
  const state = service();
  await install(context, state);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "locks", {
      value: undefined,
      configurable: true,
    });
    localStorage.setItem(
      "wg-player-v2-guest:wizards-gambit-progress-v1",
      "{broken",
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "连接B站存档", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("安全存档锁");
  expect(state.writes).toEqual([]);
  await page
    .getByRole("button", { name: "使用本机访客存档", exact: true })
    .click();
  expect(await page.getByTestId("cottage-hub").count()).toBe(0);
  const before = await page.evaluate(() => ({ ...localStorage }));
  await page.getByLabel("选择修复备份").setInputFiles({
    name: "repair.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "wizard-chess-player-backup",
        version: 2,
        save: { schema: 2, savedAt: 12345, ...original() },
      }),
    ),
  });
  await expect(page.getByTestId("cottage-hub")).toBeVisible();
  await settings(page);
  await expect(page.getByRole("status")).toContainText("隔离临时游玩");
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份文件", exact: true }).click();
  expect(
    JSON.parse(await readFile((await (await exported).path())!, "utf8")).save
      .progress.taps,
  ).toBe(40);
  const raw = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出原持久档原件", exact: true })
    .click();
  expect(
    JSON.parse(await readFile((await (await raw).path())!, "utf8")).data[
      "wizards-gambit-progress-v1"
    ],
  ).toBe("{broken");
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  expect(state.writes).toEqual([]);
});

test("无锁时未完成的恢复只在临时副本重放，原journal与存档保持不变", async ({
  page,
  context,
}) => {
  await context.addInitScript(
    (save) => {
      Object.defineProperty(navigator, "locks", {
        value: undefined,
        configurable: true,
      });
      localStorage.setItem("wizards-gambit-progress-v1", "null");
      localStorage.setItem("wg-save-meta-restore", JSON.stringify(save));
    },
    { schema: 2, savedAt: 12345, ...original() },
  );
  await page.goto("/");
  await expect(page.getByTestId("cottage-hub")).toBeVisible();
  const before = await page.evaluate(() => ({ ...localStorage }));
  await settings(page);
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份文件", exact: true }).click();
  const file = JSON.parse(
    await readFile((await (await exported).path())!, "utf8"),
  );
  expect(file.save.progress).toEqual(original().progress);
  expect(file.save.companion).toEqual(original().companion);
  expect(file.save.session.state.history).toHaveLength(1);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
});

test("Toy连接前不写云；旧档明确迁移，完整导出；新设备恢复番外、衣装和未完棋局", async ({
  page,
  context,
  browser,
}) => {
  const state = service();
  await install(context, state);
  await seedOriginal(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "连接B站存档" })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await connect(page);
  await settings(page);
  expect((await collection(page))?.owned ?? 3).toBe(3);
  await page
    .getByRole("button", { name: "将旧本机档合并到此账号", exact: true })
    .click();
  await expect.poll(async () => (await collection(page))?.owned).toBe(0xffffff);
  await settings(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份文件" }).click();
  const download = await downloadPromise;
  const text = await readFile((await download.path())!, "utf8"),
    file = JSON.parse(text);
  expect(text).not.toContain("test-room-private-token");
  expect(file.save.session.state.history).toHaveLength(1);
  expect(file.save.dates.college.choices).toEqual([1, null]);
  await expect(page.getByRole("status")).toContainText("完整存档已同步", {
    timeout: 15000,
  });
  expect(state.accounts.A.progress_v1).toBeUndefined();
  const localOriginal = await page.evaluate(() =>
    localStorage.getItem("wizards-gambit-progress-v1"),
  );
  expect(JSON.parse(localOriginal!).unlocked).toBe(6);
  await mkdir(".local/save-v8", { recursive: true });
  await page.screenshot({
    path: ".local/save-v8/connected-settings.png",
    fullPage: true,
  });
  const device = await browser.newContext();
  try {
    await install(device, state);
    const p = await device.newPage();
    await p.goto("http://127.0.0.1:8788/");
    await connect(p);
    expect((await collection(p)).owned).toBe(0xffffff);
    expect(
      await p.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).college.choices,
        physical("dates"),
      ),
    ).toEqual([1, null]);
    await p.getByRole("button", { name: /继续游戏/ }).click();
    await expect(
      p.getByRole("button", { name: "e4 白兵", exact: true }),
    ).toBeVisible();
    await p.screenshot({
      path: ".local/save-v8/restored-game.png",
      fullPage: true,
    });
    const handover = p.getByRole("button", { name: /我已接手/ });
    if (await handover.isVisible()) await handover.click();
    await p.getByRole("button", { name: "衣装收藏", exact: true }).click();
    await p.getByRole("button", { name: "专属番外", exact: true }).click();
    await expect(p.getByRole("dialog")).toContainText("8 / 24");
    await p.screenshot({
      path: ".local/save-v8/restored-story.png",
      fullPage: true,
    });
  } finally {
    await device.close();
  }
});

test("同浏览器切换账号隔离；同账号第二窗口拒绝并发游玩", async ({
  page,
  context,
}) => {
  const state = service();
  await install(context, state);
  await page.goto("/");
  await connect(page);
  await page.getByTestId("malfoy-portrait").click();
  await expect.poll(async () => (await collection(page))?.heart).toBe(1);
  const second = await context.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: "连接B站存档" }).click();
  await expect(second.getByRole("status")).toContainText("另一个窗口");
  expect(await second.getByTestId("cottage-hub").count()).toBe(0);
  await second.close();
  await settings(page);
  await page.getByRole("button", { name: "断开并切换账号" }).click();
  await page.evaluate(() => {
    (window as any).saveTestAccount = "B";
    sessionStorage.setItem("test-account", "B");
  });
  await connect(page);
  expect((await collection(page, "B"))?.heart ?? 0).toBe(0);
  expect((await collection(page, "A")).heart).toBe(1);
  await settings(page);
  await expect(page.getByRole("status")).toContainText("完整存档已同步", {
    timeout: 15000,
  });
  const commits = Object.entries(state.accounts.B)
    .filter(([k]) => k.includes("_m_"))
    .map(([, v]) => JSON.parse(v));
  expect(
    commits.every((c) => c.owner === owner("B") && c.progress.taps === 0),
  ).toBe(true);
});

test("断网待同步跨重启保留；网络恢复后自动补传", async ({ page, context }) => {
  const state = service();
  await install(context, state);
  await page.goto("/");
  await connect(page);
  await settings(page);
  await expect(page.getByRole("status")).toContainText("完整存档已同步", {
    timeout: 15000,
  });
  await close(page);
  state.offline = true;
  await page.getByTestId("malfoy-portrait").click();
  await settings(page);
  await expect(page.getByRole("status")).toContainText("离线", {
    timeout: 15000,
  });
  expect(
    await page.evaluate(
      (who) => localStorage.getItem(`wg-player-v2-${who}:wg-save-meta-dirty`),
      owner(),
    ),
  ).toBe("1");
  const count = state.writes.length;
  await page.reload();
  await page.getByRole("button", { name: "连接B站存档" }).click();
  await expect(page.getByRole("status")).toContainText("离线");
  expect(state.writes).toHaveLength(count);
  state.offline = false;
  await connect(page);
  await settings(page);
  await expect(page.getByRole("status")).toContainText("完整存档已同步", {
    timeout: 15000,
  });
  expect((await collection(page)).heart).toBe(1);
  expect(
    await page.evaluate(
      (who) => localStorage.getItem(`wg-player-v2-${who}:wg-save-meta-dirty`),
      owner(),
    ),
  ).toBeNull();
});

test("棋旅离线本机保留，SDK Mock跨设备恢复，并在切号后隔离", async ({
  page,
  context,
  browser,
}) => {
  const state = service();
  await install(context, state);
  await page.goto("/");
  await connect(page);
  await page
    .getByRole("button", { name: /今晚棋旅/ })
    .first()
    .click();
  await page.getByRole("button", { name: "和你一起出发", exact: true }).click();
  await expect(page.getByTestId("board-2d")).toBeVisible();
  state.offline = true;
  await page.getByRole("button", { name: "一起看这一步", exact: true }).click();
  const journeyKey = physical("journey");
  await expect
    .poll(() =>
      page.evaluate(
        (k) =>
          JSON.parse(localStorage.getItem(k)!).activeRun.facts.some(
            (f: any) => f.type === "help",
          ),
        journeyKey,
      ),
    )
    .toBe(true);
  const before = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    journeyKey,
  );
  await settings(page);
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "离线",
    { timeout: 15000 },
  );
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!),
      journeyKey,
    ),
  ).toEqual(before);
  state.offline = false;
  await page.getByRole("button", { name: "立即同步", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "完整存档已同步",
    { timeout: 15000 },
  );
  const device = await browser.newContext();
  try {
    await install(device, state);
    const other = await device.newPage();
    await other.goto("http://127.0.0.1:8788/");
    await connect(other);
    expect(
      await other.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!),
        journeyKey,
      ),
    ).toEqual(before);
    await other
      .getByRole("button", { name: /继续这一晚/ })
      .first()
      .click();
    await expect(other.getByTestId("board-2d")).toBeVisible();
  } finally {
    await device.close();
  }
  await page
    .getByRole("button", { name: "断开并切换账号", exact: true })
    .click();
  await page.evaluate(() => {
    (window as any).saveTestAccount = "B";
    sessionStorage.setItem("test-account", "B");
  });
  await connect(page);
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!),
      physical("journey", "B"),
    ),
  ).toEqual(initialJourneyProgress());
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!),
      journeyKey,
    ),
  ).toEqual(before);
});

test("无OpenID不上传；访客可导出，非法导入保留原档", async ({
  page,
  context,
}) => {
  const state = service();
  state.profileMissing = true;
  await install(context, state);
  await page.goto("/");
  await page.getByRole("button", { name: "连接B站存档" }).click();
  await expect(page.getByRole("status")).toContainText("身份");
  expect(state.writes).toHaveLength(0);
  await page.getByRole("button", { name: "使用本机访客存档" }).click();
  await page.getByTestId("malfoy-portrait").click();
  await settings(page);
  const before = await page.evaluate(() =>
    localStorage.getItem("wg-player-v2-guest:wizards-gambit-progress-v1"),
  );
  await page.getByLabel("选择存档备份文件").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":999}'),
  });
  await expect(page.getByRole("status")).toContainText("有效备份");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wg-player-v2-guest:wizards-gambit-progress-v1"),
    ),
  ).toBe(before);
  expect(state.writes).toHaveLength(0);
});

test("文件导入与云端棋局明确恢复，合并前副本可回滚", async ({
  page,
  context,
}) => {
  const state = service();
  await install(context, state);
  await page.goto("/");
  await connect(page);
  const data = original();
  await settings(page);
  await page.getByLabel("选择存档备份文件").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "wizard-chess-player-backup",
        version: 2,
        save: { schema: 2, savedAt: 1000, ...data },
      }),
    ),
  });
  await expect.poll(async () => (await collection(page))?.owned).toBe(0xffffff);
  await settings(page);
  await expect(page.getByRole("status")).toContainText("完整存档已同步", {
    timeout: 15000,
  });
  await close(page);
  await openTable(page);
  await page.getByRole("button", { name: /同机双人/ }).click();
  await page.getByRole("button", { name: /棋子就位/ }).click();
  await settings(page);
  await page.getByRole("button", { name: "查看云端棋局" }).click();
  await expect(
    page.getByRole("button", { name: /恢复棋局.*1条棋谱/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /恢复棋局.*1条棋谱/ })
    .first()
    .click();
  await page.getByRole("button", { name: /继续游戏/ }).click();
  await expect(
    page.getByRole("button", { name: "e4 白兵", exact: true }),
  ).toBeVisible();
  await settings(page);
  await page.getByRole("button", { name: "恢复合并前的本机备份" }).click();
  await page.getByRole("button", { name: /继续游戏/ }).click();
  await expect(
    page.getByRole("button", { name: "e2 白兵", exact: true }),
  ).toBeVisible();
});
