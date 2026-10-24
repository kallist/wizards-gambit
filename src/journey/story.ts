import { squareName } from "../domain/types";
import { spellById } from "../domain/spells";
import type { Expression } from "../story/companion";
import type { JourneyFact, JourneyMemory, JourneyRun } from "./model";

export interface JourneyResponse {
  malfoy: string;
  harry: string;
  expression: Expression;
}
export function memorySource(memory: JourneyMemory): string {
  const tea = memory.facts.find((f) => f.type === "tea");
  const help = memory.facts.some((f) => f.type === "help");
  const won = memory.facts.filter(
    (f) => f.type === "node" && f.result === "won",
  ).length;
  const cup =
    tea?.type === "tea"
      ? tea.choice === "offer"
        ? "哈利递给她的那杯茶"
        : "她递到哈利手里的那杯茶"
      : "还没来得及倒满的茶杯";
  return `${cup}；一起收好${won}局棋${help ? "，中途也认真商量过" : ""}。${memory.outcome === "complete" ? "三段棋都走完了。" : "那晚先回了家，约定没有取消。"}`;
}

export function responseFor(
  run: JourneyRun | null,
  previous: JourneyMemory | null,
): JourneyResponse {
  if (!run) {
    const tea = previous?.facts.find((f) => f.type === "tea");
    return tea?.type === "tea"
      ? {
          malfoy:
            tea.choice === "offer"
              ? "杯垫还在。你上回递茶时倒很稳，今晚也别急。"
              : "上回那杯没烫着吧？今晚的座位还是替你留着。",
          harry: "茶和棋都慢慢来。我就是来陪你的。",
          expression: 7,
        }
      : {
          malfoy: "三段棋，一杯茶。别又只顾着看我，波特。",
          harry: "那我们轮流——先看棋，再看你。",
          expression: 0,
        };
  }
  if (run.stage === "home") {
    const tea = run.facts.find((f) => f.type === "tea");
    const detail =
      tea?.type === "tea"
        ? tea.choice === "offer"
          ? "刚才那杯茶，我还没喝完。"
          : "我给你留的茶还热着。"
        : "茶还没倒，正好一起。";
    return {
      malfoy:
        run.outcome === "complete"
          ? `棋都收好了。${detail}再坐一会儿。`
          : `棋先停在这里。${detail}不急着重来。`,
      harry: run.facts.some((f) => f.type === "retry")
        ? "刚才那一步，我们下次再一起看。今晚我想先陪你把茶喝完。"
        : "好。今晚最想留下的，也不是输赢。",
      expression: 7,
    };
  }
  if (run.stage === "retry")
    return {
      malfoy: "这一手没走通。再商量一次，还是先回去喝茶？都听你的。",
      harry: "你肯陪我看，我就不觉得是白下了。",
      expression: 6,
    };
  if (run.stage === "tea")
    return {
      malfoy: "先歇一小会儿。这次，是你递给我，还是等我递给你？",
      harry: "原来你连这个位置都替我留好了。",
      expression: 1,
    };
  if (run.stage === "route") {
    const tea = run.facts.find((f) => f.type === "tea");
    return {
      malfoy:
        tea?.type === "tea" && tea.choice === "offer"
          ? "嗯，接住了。手很稳嘛，波特。剩下两局想先去哪边？"
          : "拿好了，杯耳在这边。剩下两局，我们一起挑。",
      harry: "茶先暖着。魔法不多了，下一步听听你的主意。",
      expression: tea?.type === "tea" && tea.choice === "offer" ? 2 : 7,
    };
  }
  if (run.stage === "between")
    return {
      malfoy: "这局也收好了。还剩下一段，手边的魔法可不会自己回来。",
      harry: "知道。剩下的留在真正用得上的时候。",
      expression: 0,
    };
  const fact = run.facts.at(-1);
  if (fact?.type === "cast")
    return fact.spell === "accio"
      ? {
          malfoy: "主教已经挪过去了。好了，这回看你的下一步。",
          harry: "这条路是我们一起找的。",
          expression: 4,
        }
      : {
          malfoy: "骑士暂时动不了。别把这点空隙全用来盯着我。",
          harry: "先看棋。喝茶的时候再认真看你。",
          expression: 2,
        };
  if (fact?.type === "move")
    return fact.captured
      ? {
          malfoy: "这枚收好了。你的袖口也收一收，等会儿还有茶。",
          harry: "记住了。棋盘要干净，你的手也别烫着。",
          expression: 3,
        }
      : {
          malfoy: `落在${squareName(fact.to)}了。别急，我们再看一眼国王身边。`,
          harry: "好。你看那一边，我看这一边。",
          expression: 4,
        };
  if (fact?.type === "help")
    return {
      malfoy: "想一起看就直说。你又不欠我一盘无懈可击的棋。",
      harry: "那你坐近一点。这里，我想听你讲。",
      expression: 7,
    };
  return {
    malfoy: "三张魔法带完整个晚上，用掉便不会补回。国王也要照顾好。",
    harry: "记下了。一起走，走不通也一起回家。",
    expression: 0,
  };
}

export function factText(fact: JourneyFact): string {
  switch (fact.type) {
    case "prepared":
      return fact.preparation === "thread"
        ? "带上引线银扣：两次飞来咒、一次石化。"
        : "带上定步银扣：两次石化、一次飞来咒。";
    case "invitation":
      return "两人答应一起走完今晚。";
    case "move":
      return `${fact.color === "white" ? "白方" : "棋影"} ${squareName(fact.from)} → ${squareName(fact.to)}${fact.captured ? "，收下一枚棋子" : ""}。`;
    case "cast":
      return `${spellById[fact.spell].name}：${fact.targets.map(squareName).join(" → ")}。`;
    case "help":
      return "一起商量过这一局；使用帮助不会减少相处。";
    case "tea":
      return fact.choice === "offer"
        ? "哈利把茶递给马尔福，她接住了。"
        : "马尔福把茶递给哈利，他接住了。";
    case "route":
      return fact.firstNode === 1
        ? "先去守夜人那一页，再看窗边。"
        : "先看窗边，再绕过守夜人。";
    case "node":
      return fact.result === "won"
        ? `第${fact.nodeId + 1}处棋影已被真正将死。`
        : `这一局停下：${fact.reason === "limit" ? "己方步数已用完" : fact.reason === "resign" ? "主动收棋" : "棋局结束"}。`;
    case "retry":
      return "用过本程唯一一次重试；恢复本节点入场时的手牌。";
    case "abandon":
      return "两人决定今晚先回家。";
    case "home":
      return "把这一晚留在了星纹杯垫上。";
  }
}
