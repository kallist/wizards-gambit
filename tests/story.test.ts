import { expect, it } from "vitest";
import {
  CHAPTERS,
  chapterComplete,
  chapterGame,
  trialGame,
  trialScore,
} from "../src/story/chapters";
import { applyAction, legalMoves } from "../src/domain/engine";
import { square } from "../src/domain/types";

it("六章共120组原创双人情境互动，标识与台词不重复", () => {
  expect(CHAPTERS).toHaveLength(6);
  expect(CHAPTERS[0].opening[0].text).toContain("二十三岁");
  const all = CHAPTERS.flatMap((c) => c.dialogues);
  expect(all).toHaveLength(120);
  expect(new Set(all.map((x) => x.id)).size).toBe(120);
  expect(new Set(all.map((x) => x.malfoy)).size).toBe(120);
  for (const c of CHAPTERS) {
    expect(c.opening.length).toBeGreaterThan(3);
    expect(c.closing.length).toBeGreaterThan(3);
    expect(legalMoves(chapterGame(c.id)).length).toBeGreaterThan(0);
  }
});
it("首章能通过合法吃子完成，圣诞章通过真实将死完成", () => {
  const first = applyAction(chapterGame(0), {
    type: "move",
    move: { from: square("a4"), to: square("a6") },
  });
  expect(chapterComplete(0, first)).toBe(true);
  const christmas = applyAction(chapterGame(3), {
    type: "move",
    move: { from: square("f7"), to: square("g7") },
  });
  expect(christmas.result?.reason).toBe("checkmate");
  expect(chapterComplete(3, christmas)).toBe(true);
});
it("试炼固定种子；失败与未结束的棋局不提交分数", () => {
  expect(trialGame()).toEqual(trialGame());
  expect(trialScore(trialGame())).toBe(0);
});
it("试炼分数只奖励将死胜利，同一棋子重复击毁不重复计分", () => {
  const s = trialGame();
  s.result = { winner: "white", reason: "checkmate" };
  s.phase = "over";
  s.history = [0, 1].map((i) => ({
    ply: i * 2,
    color: "white",
    type: "move",
    text: "兵 ×",
    captured: "p",
    capturedId: "black-pawn",
  }));
  expect(trialScore(s)).toBe(1290);
  s.history[1].capturedId = "another-pawn";
  expect(trialScore(s)).toBe(1300);
  s.result.reason = "resign";
  expect(trialScore(s)).toBe(0);
});
