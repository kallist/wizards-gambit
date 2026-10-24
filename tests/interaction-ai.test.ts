import { expect, it } from "vitest";
import { characterInteraction, tapResponse } from "../src/story/interaction";
import type { Expression } from "../src/story/companion";
import { aiView, chooseAction } from "../src/ai/search";
import { applyAction, createGame } from "../src/domain/engine";
import { trialGame } from "../src/story/chapters";

it("点击次数增加时羞涩阶段单调增加，最终保持温柔状态", () => {
  const states = Array.from({ length: 30 }, (_, i) => characterInteraction(i));
  expect(
    states.map((s) => s.stage).every((n, i, a) => i === 0 || n >= a[i - 1]),
  ).toBe(true);
  expect(new Set(states.map((s) => s.frame)).size).toBe(5);
  expect(states[29].frame).toBe(7);
});
it("角色互动不改变棋局、手牌或随机源", () => {
  const s = createGame("magic", 42),
    before = JSON.stringify(s);
  for (let i = 0; i < 50; i++) {
    characterInteraction(i);
    tapResponse(i, i);
  }
  expect(JSON.stringify(s)).toBe(before);
});
it("每次点击都有对应神态，同一阶段及封顶后仍换脸换对白", () => {
  for (const taps of [0, 1, 4, 8, 13, 100000]) {
    let previous: ReturnType<typeof tapResponse> | undefined;
    const ids = new Set<string>();
    for (let cursor = 0; cursor < 32; cursor++) {
      const next = tapResponse(taps, cursor, previous?.expression);
      expect(next.expression).toBeGreaterThanOrEqual(0);
      expect(next.expression).toBeLessThan(8);
      expect(next.harry.length).toBeGreaterThan(2);
      if (previous) {
        expect(next.expression).not.toBe(previous.expression);
        expect(next.malfoy).not.toBe(previous.malfoy);
        expect(next.harry).not.toBe(previous.harry);
      }
      ids.add(next.id);
      previous = next;
    }
    expect(ids.size).toBeGreaterThan(1);
  }
});
it("阶段变化也不重复上一张表情，选择确定且不消费随机数", () => {
  let previous: Expression = 0;
  for (let taps = 1; taps <= 32; taps++) {
    const a = tapResponse(taps, taps - 1, previous);
    expect(a).toEqual(tapResponse(taps, taps - 1, previous));
    expect(a.expression).not.toBe(previous);
    previous = a.expression;
  }
  expect(tapResponse(1, 0, 0)).toMatchObject({
    expression: 1,
    malfoy: "波特，棋盘在那边。你碰我的袖子做什么？",
    harry: "有根线头。好了，现在轮到你嫌弃我的棋艺。",
  });
});
it("异常展示游标与点击数仍返回有效回应", () => {
  for (const n of [NaN, Infinity, -Infinity, -4]) {
    expect(tapResponse(n, n).malfoy).toBeTruthy();
    expect(tapResponse(n, n).expression).toBeLessThan(8);
  }
});
it("AI 输入隐藏对方未知技能，并保留被揭示的牌", () => {
  const s = createGame("magic", 42);
  s.revealed.black = [s.hands.black[0].id];
  const n = aiView(s);
  expect(n.hands.black[0].spell).toBe(s.hands.black[0].spell);
  expect(n.hands.black.slice(1).every((c) => c.spell === "protego")).toBe(true);
});
it("三档 AI 均返回合法动作", () => {
  for (const difficulty of ["gentle", "normal", "clever"] as const) {
    const s = createGame("magic", 42),
      a = chooseAction(s, difficulty);
    expect(a).not.toBeNull();
    expect(() => applyAction(s, a!)).not.toThrow();
  }
});
it("试炼 AI 采用固定候选与完整回复搜索，重放动作一致", () => {
  const s = trialGame();
  const a = chooseAction(s, "normal", true),
    b = chooseAction(s, "normal", true);
  expect(a).toEqual(b);
  expect(() => applyAction(s, a!)).not.toThrow();
});
