import { openTable } from "./navigation";
import { expect, test, type Page } from "@playwright/test";
import { applyAction, fromFEN } from "../../src/domain/engine";
import { square } from "../../src/domain/types";

const collectionKey = "wizards-gambit-companion-v1";
async function firstChapter(page: Page) {
  await page.goto("/");
  await openTable(page);
  await page.getByRole("button", { name: /赴一场约棋/ }).click();
  await page.getByRole("button", { name: "稍后再读" }).click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
}
async function finishChapter(page: Page) {
  await page.getByRole("button", { name: "a4 白城堡", exact: true }).click();
  await page.getByRole("button", { name: /a6 黑骑士/ }).click();
}
async function collection(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    collectionKey,
  );
}
async function closeChapterEnding(page: Page) {
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "六封冬日情书" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
}
test("缺少安全上下文 UUID API 时仍可开局并刷新保留对局身份", async ({
  page,
}) => {
  // Capability simulation only; this does not claim a physical LAN-device test.
  await page.addInitScript(() =>
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      value: undefined,
      configurable: true,
    }),
  );
  await firstChapter(page);
  const id = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("wizards-gambit-session-v1")!).matchId,
  );
  expect(id).toMatch(/^local:[a-f0-9]{32}$/);
  await page.reload();
  await page.getByRole("button", { name: /继续游戏/ }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("wizards-gambit-session-v1")!).matchId,
    ),
  ).toBe(id);
});

for (const fixture of [
  {
    name: "赢棋",
    fen: "7k/8/5KQ1/8/8/8/8/8 w - - 0 1",
    from: "g6",
    to: "g7",
    winner: "white",
  },
  {
    name: "输棋",
    fen: "8/8/8/8/8/5kq1/8/7K b - - 0 1",
    from: "g3",
    to: "g2",
    winner: "black",
  },
  {
    name: "和棋",
    fen: "7k/8/5KQ1/8/8/8/8/8 w - - 0 1",
    from: "g6",
    to: "f7",
    winner: null,
  },
] as const) {
  test(`合法终局恢复后${fixture.name}同样领取一套，重复打开不再领取`, async ({
    page,
  }) => {
    // Terminal fixtures are produced by the actual engine. This checks the UI
    // result/persistence boundary, not a claim of a full human-played match.
    const state = applyAction(fromFEN(fixture.fen, "classic"), {
      type: "move",
      move: { from: square(fixture.from), to: square(fixture.to) },
    });
    expect(state.result?.winner).toBe(fixture.winner);
    await page.addInitScript(
      (session) => {
        if (!localStorage.getItem("wizards-gambit-session-v1"))
          localStorage.setItem(
            "wizards-gambit-session-v1",
            JSON.stringify(session),
          );
      },
      {
        mode: "local",
        state,
        chapter: 0,
        human: "white",
        difficulty: "gentle",
        matchId: `local:result-${fixture.name === "赢棋" ? "win" : fixture.name === "输棋" ? "loss" : "draw"}`,
      },
    );
    await page.goto("/");
    await page.getByRole("button", { name: /继续游戏/ }).click();
    await expect
      .poll(async () => (await collection(page))?.claimed.length)
      .toBe(1);
    const saved = await collection(page);
    const resultLine =
      fixture.winner === null
        ? "平分秋色"
        : `${fixture.winner === "white" ? "白方" : "黑方"}赢下了这一局`;
    await expect(page.locator(".mirror-dialogue")).toContainText(resultLine);
    await expect(page.locator(".result-quote")).toContainText(resultLine);
    await page.reload();
    await page.getByRole("button", { name: /继续游戏/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await collection(page)).toEqual(saved);
  });
}

test("两个真实同源标签完成同一剧情对局，仅一次领取并同步心动", async ({
  page,
  context,
}) => {
  await firstChapter(page);
  const second = await context.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: /继续游戏/ }).click();
  await Promise.all([finishChapter(page), finishChapter(second)]);
  await expect
    .poll(async () => (await collection(page))?.claimed.length)
    .toBe(1);
  const saved = await collection(page);
  expect(saved.owned.toString(2).replaceAll("0", "")).toHaveLength(3);
  await expect.poll(() => collection(second)).toEqual(saved);
  await closeChapterEnding(page);
  await closeChapterEnding(second);
  await page.getByTestId("malfoy-portrait").click();
  await expect
    .poll(async () => (await collection(second))?.heart)
    .toBe(saved.heart + 1);
  await expect(second.getByTestId("mirror-companion")).toContainText(
    `心动 ${saved.heart + 1}`,
  );
});

test("领取写入失败不显示永久解锁，恢复存储后同一对局可重试", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, "restoreCollectionStorage", {
      value: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Test quota", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, collectionKey);
  await firstChapter(page);
  await finishChapter(page);
  await expect.poll(() => collection(page)).toBeNull();
  await closeChapterEnding(page);
  await expect(
    page.getByRole("button", { name: "衣装未保存 · 重试领取" }),
  ).toBeVisible();
  await expect(page.locator(".wardrobe-reward")).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as unknown as { restoreCollectionStorage: () => void }
    ).restoreCollectionStorage(),
  );
  await page.getByRole("button", { name: "衣装未保存 · 重试领取" }).click();
  await expect
    .poll(async () => (await collection(page))?.claimed.length)
    .toBe(1);
  await expect(page.locator(".wardrobe-reward")).toContainText("新衣装");
  await expect(page.locator(".reward-retry")).toHaveCount(0);
});

test("真实 WebAudio 配乐有采样输出，音量可调，关闭会停止全部配乐声部", async ({
  page,
}) => {
  // Observe native audio nodes in this isolated test page. No AudioContext mock.
  await page.addInitScript(() => {
    const originalGain = AudioContext.prototype.createGain;
    const originalOscillator = AudioContext.prototype.createOscillator;
    const probe: {
      ctx?: AudioContext;
      bus?: GainNode;
      analyser?: AnalyserNode;
      voices: Set<OscillatorNode>;
    } = { voices: new Set() };
    Object.defineProperty(window, "musicProbe", { value: probe });
    AudioContext.prototype.createGain = function () {
      const gain = originalGain.call(this);
      if (!probe.bus) {
        probe.ctx = this;
        probe.bus = gain;
        probe.analyser = this.createAnalyser();
        gain.connect(probe.analyser);
      }
      return gain;
    };
    AudioContext.prototype.createOscillator = function () {
      const voice = originalOscillator.call(this);
      probe.voices.add(voice);
      voice.addEventListener("ended", () => probe.voices.delete(voice));
      return voice;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "魔法与击毁音效" });
  await toggle.click();
  const sample = () =>
    page.evaluate(() => {
      const p = (
        window as unknown as {
          musicProbe: {
            ctx?: AudioContext;
            bus?: GainNode;
            analyser?: AnalyserNode;
            voices: Set<OscillatorNode>;
          };
        }
      ).musicProbe;
      const values = new Float32Array(p.analyser?.fftSize ?? 32);
      p.analyser?.getFloatTimeDomainData(values);
      return {
        state: p.ctx?.state,
        gain: p.bus?.gain.value,
        voices: p.voices.size,
        rms: Math.sqrt(
          values.reduce((sum, value) => sum + value * value, 0) / values.length,
        ),
      };
    });
  await expect.poll(async () => (await sample()).state).toBe("running");
  await expect.poll(async () => (await sample()).rms).toBeGreaterThan(0.00001);
  const slider = page.getByRole("slider", { name: "配乐音量" });
  await slider.focus();
  await slider.press("Home");
  for (let i = 0; i < 3; i++) await slider.press("ArrowRight");
  await expect(slider).toHaveValue("0.15");
  await expect
    .poll(async () => Math.abs(((await sample()).gain ?? 1) - 0.15))
    .toBeLessThan(0.005);
  await toggle.click();
  await expect.poll(async () => (await sample()).voices).toBe(0);
  await expect.poll(async () => (await sample()).rms).toBeLessThan(0.000001);
  await page.reload();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("slider", { name: "配乐音量" })).toHaveValue(
    "0.15",
  );
  await expect(
    page.getByRole("switch", { name: "魔法与击毁音效" }),
  ).toHaveAttribute("aria-checked", "false");
});
