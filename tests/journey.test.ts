import { forcingMove } from "./helpers/journeySolver";
import { describe, expect, it, vi } from "vitest";
import {
  applyAction,
  legalMoves,
  validateSavedGame,
} from "../src/domain/engine";
import type { Action, GameState } from "../src/domain/types";
import {
  createNodeGame,
  preparationCards,
  JOURNEY_NODES,
} from "../src/journey/catalog";
import {
  decodeJourneyProgress,
  initialJourneyProgress,
  mergeJourneyProgress,
  reduceJourney,
  type JourneyCommand,
  type JourneyProgress,
} from "../src/journey/model";
import {
  commitJourney,
  JOURNEY_KEY,
  readJourney,
} from "../src/journey/storage";
import { getPlayerStorage } from "../src/platform/playerStorage";
import {
  backupFile,
  capturePlayerSave,
  decodePlayerSave,
  parseBackupFile,
  writePlayerSave,
} from "../src/platform/saveModel";

let serial = 0;
const act = (p: JourneyProgress, cmd: Omit<JourneyCommand, "commandId">) =>
  reduceJourney(p, { ...cmd, commandId: "test_" + ++serial } as JourneyCommand);
function begin() {
  let p = act(initialJourneyProgress(), {
    type: "start",
    runId: "run_" + ++serial,
    seed: 22,
    preparation: "thread",
  } as JourneyCommand);
  return act(p, { type: "acceptInvitation" });
}
function play(p: JourneyProgress, action: Action) {
  return act(p, {
    type: "play",
    action,
    expectedGameVersion: p.activeRun!.game!.version,
  } as JourneyCommand);
}

function finishNode(progress: JourneyProgress) {
  let p = progress;
  while (p.activeRun?.stage === "playing") {
    const s = p.activeRun.game!;
    const a =
      s.turn === "white"
        ? forcingMove(s)
        : { type: "move" as const, move: legalMoves(s)[0] };
    expect(a).not.toBeNull();
    p = play(p, a!);
  }
  return p;
}

describe("three-node journey", () => {
  it("each authored node has a two-move fallback against all legal black replies without drawing cards", () => {
    for (const node of JOURNEY_NODES) {
      const s = createNodeGame(node.id, [], 22);
      expect(validateSavedGame(s)).toBe(true);
      expect(forcingMove(s)).not.toBeNull();
    }
  });
  it("a second identical card can be used first and survives strict replay and export", () => {
    const p = begin(),
      before = structuredClone(p);
    const next = play(p, {
      type: "cast",
      cast: { cardId: "journey-2", targets: [43, 27] },
    });
    expect(next.activeRun!.remainingHand.map((c) => c.id)).toEqual([
      "journey-1",
      "journey-3",
    ]);
    expect(decodeJourneyProgress(next)).toEqual(next);
    expect(p).toEqual(before);
    expect(() => play(p, { type: "move", move: { from: 0, to: 1 } })).toThrow();
    expect(p).toEqual(before);
  });
  it("consumed preparation carries between nodes; retry only restores the current entry hand", () => {
    let p = play(begin(), {
      type: "cast",
      cast: { cardId: "journey-2", targets: [43, 27] },
    });
    p = play(p, { type: "move", move: { from: 21, to: 22 } });
    expect(p.activeRun!.stage).toBe("tea");
    p = act(p, { type: "tea", choice: "offer" } as JourneyCommand);
    p = act(p, { type: "route", firstNode: 1 } as JourneyCommand);
    expect(p.activeRun!.remainingHand).toHaveLength(2);
    p = play(p, { type: "resign" });
    expect(p.activeRun!.stage).toBe("retry");
    p = act(p, { type: "retry" });
    expect(p.activeRun!.remainingHand.map((c) => c.id)).toEqual([
      "journey-1",
      "journey-3",
    ]);
    p = play(p, { type: "resign" });
    expect(p.activeRun).toMatchObject({
      stage: "home",
      outcome: "failed",
      retriesUsed: 1,
    });
    expect(() => act(p, { type: "retry" })).toThrow();
    expect(decodeJourneyProgress(p)).toEqual(p);
  });
  it("completes both node orders, keeps truthful provenance and deduplicates home commands", () => {
    for (const first of [1, 2] as const) {
      let p = finishNode(begin());
      p = act(p, { type: "tea", choice: "receive" } as JourneyCommand);
      p = act(p, { type: "route", firstNode: first } as JourneyCommand);
      p = finishNode(p);
      p = act(p, { type: "advance" });
      p = finishNode(p);
      expect(p.activeRun).toMatchObject({
        stage: "home",
        outcome: "complete",
        completedNodeIds: [0, first, first === 1 ? 2 : 1],
      });
      p = act(p, {
        type: "finishHome",
        keepsake: "cup-mark",
      } as JourneyCommand);
      expect(p.memories).toHaveLength(1);
      expect(
        act(p, { type: "finishHome", keepsake: "cup-mark" } as JourneyCommand),
      ).toEqual(p);
      expect(decodeJourneyProgress(p)).toEqual(p);
      const foreign = structuredClone(p) as any;
      foreign.activeRun.game.board[0] = { providerKey: "foreign" };
      expect(() => decodeJourneyProgress(foreign)).toThrow();
    }
  });
  it("replay is unbounded in evenings while first-earned patterns remain and latest provenance updates", () => {
    let p = initialJourneyProgress();
    for (let i = 0; i < 140; i++) {
      p = act(p, {
        type: "start",
        runId: "evening_" + i,
        seed: 22,
        preparation: "thread",
      } as JourneyCommand);
      p = act(p, { type: "abandon" });
      p = act(p, {
        type: "finishHome",
        keepsake: "cup-mark",
      } as JourneyCommand);
      p = decodeJourneyProgress(p);
    }
    expect(p.memories).toHaveLength(1);
    expect(p.memories[0].runId).toBe("evening_0");
    expect(p.lastMemory!.runId).toBe("evening_139");
    expect(JSON.stringify(p).length).toBeLessThan(20000);
  });
});

describe("journey persistence boundaries", () => {
  it("merging a later cloud ending never closes or invalidates the local active board", () => {
    const local = begin();
    let remote = act(local, { type: "abandon" });
    remote = act(remote, {
      type: "finishHome",
      keepsake: "cup-mark",
    } as JourneyCommand);
    const merged = mergeJourneyProgress(local, remote);
    expect(merged.activeRun).toEqual(local.activeRun);
    expect(merged.lastMemory).toBeNull();
    expect(merged.memories).toHaveLength(0);
    expect(decodeJourneyProgress(merged)).toEqual(merged);
    const forged = structuredClone(local);
    forged.activeRun!.stage = "tea";
    forged.activeRun!.completedNodeIds = [0];
    expect(() => decodeJourneyProgress(forged)).toThrow();
  });
  function storage() {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
      removeItem: (k: string) => data.delete(k),
    });
    vi.stubGlobal("window", new EventTarget());
    let queue = Promise.resolve();
    vi.stubGlobal("navigator", {
      locks: {
        request: (_key: string, cb: () => unknown) => {
          const r = queue.then(cb);
          queue = r.then(
            () => {},
            () => {},
          );
          return r;
        },
      },
    });
    return getPlayerStorage("local");
  }
  it("only one same-revision command commits and cancelled owners cannot write", async () => {
    const port = storage();
    try {
      const command = {
        type: "start" as const,
        runId: "one",
        preparation: "thread" as const,
        seed: 1,
        commandId: "first",
      };
      const [a, b] = await Promise.all([
        commitJourney(port, 0, command, () => true),
        commitJourney(
          port,
          0,
          { ...command, runId: "two", commandId: "second" },
          () => true,
        ),
      ]);
      expect(a!.kind).toBe("saved");
      expect(b!.kind).toBe("stale");
      const before = port.getItem(JOURNEY_KEY);
      expect(
        await commitJourney(
          port,
          1,
          { type: "acceptInvitation", commandId: "late" },
          () => false,
        ),
      ).toBeNull();
      expect(port.getItem(JOURNEY_KEY)).toBe(before);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("schema2 migrates without changing ordinary game; files preserve journey and drop foreign fields", () => {
    const port = storage();
    try {
      const old = capturePlayerSave(port);
      const legacy = { ...old, schema: 2 };
      delete (legacy as any).journey;
      expect(decodePlayerSave(legacy).journey).toEqual(
        initialJourneyProgress(),
      );
      port.setItem(JOURNEY_KEY, JSON.stringify(begin()));
      const rich = capturePlayerSave(port);
      const restored = parseBackupFile(backupFile(rich));
      expect(restored.journey).toEqual(rich.journey);
      writePlayerSave(port, restored);
      expect(readJourney(port)).toEqual(rich.journey);
      const merged = mergeJourneyProgress(
        rich.journey,
        initialJourneyProgress(),
      );
      expect(merged.activeRun).toEqual(rich.journey.activeRun);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
