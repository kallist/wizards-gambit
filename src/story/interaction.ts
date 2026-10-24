import type { Expression } from "./companion";

export interface Interaction {
  taps: number;
  stage: number;
  frame: number;
  malfoy: string;
  harry: string;
}
const lines = [
  ["坐吧，波特。茶还热着，棋子也没跑。", "看来我来得正好。"],
  ["先看棋盘。我的袖口可没有合法落点。", "有根线头。现在好了。"],
  ["你再把椅子挪过来，我就得给你算两份座位费。", "记在账上。明天我还来。"],
  ["……等一下。领带被你弄歪了。", "是你拉住的。不过我不急着走。"],
  ["你坐到我这边，黑方的位置怎么办？", "让棋子自己抗议去吧。"],
  ["不准笑。是炉火太旺。", "好。我去添点柴——你别瞪我。"],
  ["下完这局陪我出去走走。伞带了吗？", "带了。只有一把。"],
  ["旁边的位置给你。别把茶碰倒。", "遵命，马尔福小姐。"],
];

export interface TapResponse {
  id: string;
  expression: Expression;
  malfoy: string;
  harry: string;
}
type Exchange = readonly [Expression, string, string];
const TAP_EXCHANGES: readonly (readonly Exchange[])[] = [
  [
    [0, "波特？你落在棋盘外面了。", "抱歉。这边比较吸引我。"],
    [3, "今天想执哪一边？", "能离茶壶近一点的那边。"],
  ],
  [
    [
      1,
      "波特，棋盘在那边。你碰我的袖子做什么？",
      "有根线头。好了，现在轮到你嫌弃我的棋艺。",
    ],
    [
      5,
      "别戳。你小时候也这么招人烦吗？",
      "差不多。不过那时候没人给我留这张椅子。",
    ],
    [3, "眼镜又滑下来了。……算了，你别动。", "你替我扶？这下看得更清楚了。"],
    [4, "你刚才那一手，倒没白练。", "这句算夸奖吗？我先收着。"],
    [0, "还没开局就走神，格兰芬多的传统？", "也许。你每次都记得来检查。"],
    [6, "手怎么这么凉？先把杯子拿着。", "那你先别收棋。暖和了再下。"],
  ],
  [
    [2, "……袖口已经理好了。还不松手？", "你先松开我的。"],
    [5, "你把椅子挪得太近了。", "那我往回挪一点？"],
    [7, "也没让你挪那么远。", "好。这个距离呢？"],
    [3, "这杯是我的。你的在左边，波特。", "难怪更甜。你偷偷多放了糖？"],
    [1, "头发上有雪。低头，不然我够不到。", "好，我不动。头发本来就够乱了。"],
    [4, "刚才是在偷笑？", "你把我的兵叫成了笨蛋。我觉得它有点像我。"],
  ],
  [
    [2, "别盯着看，我会系领带。", "嗯。只是第三次系反了。"],
    [4, "波特，你那副得意的样子真欠收拾。", "可你笑了。我很难改。"],
    [1, "你叫得太大声了。", "德拉科？好，这次只让你听见。"],
    [7, "再坐一会儿吧。外面还在下雪。", "我本来也没打算走。"],
    [
      5,
      "别摸头发。你手里有饼干屑。",
      "被发现了。我去洗手，你帮我看住最后一块。",
    ],
    [3, "赢了就这么高兴？", "还没赢。你刚才握了我的手。"],
  ],
  [
    [7, "手给我。就一会儿。", "好。另一只手还够我们下棋。"],
    [3, "今天怎么这么安静，波特？", "在等你先说想我。"],
    [1, "我只是看门口。你别多想。", "嗯。我也只是提前了半小时。"],
    [4, "刚才那句，敢不敢再说一次？", "想你了。需要我拼给你听吗？"],
    [2, "这种话……好歹等我把茶放下。", "好。杯碟在这里，我接着。"],
    [5, "最后一块饼干呢？波特。", "藏在你手里。我刚才看见了。"],
    [6, "眼睛疼就歇一局。别硬撑。", "那借你的肩膀用一会儿？"],
    [0, "你今晚还回自己那边坐？", "不回。除非你要把我将死。"],
  ],
];

/** Presentation-only cursor; never consumes chess randomness or changes progress. */
export function tapResponse(
  taps: number,
  cursor: number,
  previous?: Expression,
): TapResponse {
  const stage = characterInteraction(Number.isFinite(taps) ? taps : 0).stage;
  const pool = TAP_EXCHANGES[stage];
  const start =
    (Number.isFinite(cursor) ? Math.max(0, Math.floor(cursor)) : 0) %
    pool.length;
  for (let offset = 0; offset < pool.length; offset++) {
    const index = (start + offset) % pool.length;
    const [expression, malfoy, harry] = pool[index];
    if (expression !== previous)
      return { id: `touch-${stage}-${index}`, expression, malfoy, harry };
  }
  throw new Error("A response pool must offer more than one expression");
}
export function characterInteraction(taps: number): Interaction {
  const safe = Math.max(0, Math.min(100000, Math.floor(taps)));
  const stage =
    safe === 0 ? 0 : safe < 4 ? 1 : safe < 8 ? 2 : safe < 13 ? 3 : 4;
  const index =
    safe === 0 ? 0 : Math.min(7, stage + (stage === 4 ? safe % 4 : 0));
  const [malfoy, harry] = lines[index];
  return { taps: safe, stage, frame: stage === 4 ? 7 : stage, malfoy, harry };
}
