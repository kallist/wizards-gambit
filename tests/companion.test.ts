import { describe, expect, it, vi } from "vitest";
import {
  ALL_OUTFITS,
  OUTFITS,
  awardOutfit,
  decodeCompanion,
  initialCompanion,
  mergeCompanion,
  ownsOutfit,
  wardrobeCount,
  validMatchId,
} from "../src/story/companion";
import {
  COMPANION_KEY,
  addHeart,
  claimOutfit,
  readCompanion,
  restoreCompanion,
  newMatchId,
} from "../src/platform/companion";
import { datePages } from "../src/story/outfitStories";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe("independent companion collection", () => {
  it("uses independent 128-bit IDs when the LAN context has no randomUUID", () => {
    const source = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: source.getRandomValues.bind(source),
    });
    try {
      const first = newMatchId(),
        second = newMatchId();
      expect(first).toMatch(/^local:[a-f0-9]{32}$/);
      expect(validMatchId(first)).toBe(true);
      expect(second).not.toBe(first);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("migrates old interactions without inventing unlocked outfits", () => {
    expect(initialCompanion(15)).toEqual({
      schema: 1,
      owned: 3,
      heart: 15,
      claimed: [],
    });
    expect(wardrobeCount(initialCompanion())).toBe(2);
    expect(initialCompanion(NaN).heart).toBe(0);
  });
  it("draws every remaining outfit exactly once and stops drawing when complete", () => {
    let p = initialCompanion();
    const rewards = new Set();
    const poolSizes: number[] = [];
    for (let i = 0; i < 22; i++) {
      const result = awardOutfit(
        p,
        `match:${i.toString().padStart(3, "0")}`,
        (count) => {
          poolSizes.push(count);
          return count - 1;
        },
      );
      p = result.progress;
      rewards.add(result.outfit);
      expect(result.status).toBe("awarded");
    }
    expect(rewards.size).toBe(22);
    expect(p.owned).toBe(ALL_OUTFITS);
    expect(decodeCompanion(p)).toEqual(p);
    expect(poolSizes).toEqual(Array.from({ length: 22 }, (_, i) => 22 - i));
    expect(
      awardOutfit(p, "match:complete", () => {
        throw Error("must not draw");
      }).status,
    ).toBe("complete");
  });
  it("same persisted match is idempotent, including reload and retries", async () => {
    const port = storage();
    const first = await claimOutfit("match:reload", 0, port, () => 0);
    const saved = readCompanion(0, port);
    const retry = await claimOutfit("match:reload", 0, port, () => {
      throw Error("must not draw");
    });
    expect(first.value.status).toBe("awarded");
    expect(retry.value.status).toBe("duplicate");
    expect(retry.state).toEqual(saved);
    expect(wardrobeCount(saved)).toBe(3);
  });
  it("serializes concurrent duplicate and different matches without lost rewards", async () => {
    const port = storage();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        claimOutfit(`match:parallel:${Math.floor(i / 2)}`, 0, port, () => 0),
      ),
    );
    expect(results.filter((r) => r.value.status === "awarded")).toHaveLength(6);
    expect(results.filter((r) => r.value.status === "duplicate")).toHaveLength(
      6,
    );
    expect(wardrobeCount(readCompanion(0, port))).toBe(8);
  });
  it("failed write leaves no partial reward or ledger and succeeds on retry", async () => {
    const port = storage();
    let fail = true;
    const failing = {
      getItem: port.getItem,
      setItem: (k: string, v: string) => {
        if (fail) throw Error("quota");
        port.setItem(k, v);
      },
    };
    await expect(
      claimOutfit("match:failure", 0, failing, () => 0),
    ).rejects.toThrow("quota");
    expect(port.values.size).toBe(0);
    fail = false;
    const result = await claimOutfit("match:failure", 0, failing, () => 0);
    expect(result.state.claimed).toEqual(["match:failure"]);
    expect(wardrobeCount(result.state)).toBe(3);
  });
  it("does not erase a collection after a read failure or corrupt save", async () => {
    const port = storage();
    port.setItem(COMPANION_KEY, "{broken");
    await expect(
      claimOutfit("match:corrupt", 0, port, () => 0),
    ).rejects.toThrow();
    expect(port.getItem(COMPANION_KEY)).toBe("{broken");
    const failing = {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("must not write");
      },
    };
    await expect(addHeart(0, failing)).rejects.toThrow("blocked");
  });
  it("merges cloud ownership and heart while retaining the local match ledger", async () => {
    const port = storage();
    const local = (await claimOutfit("match:local1", 0, port, () => 0)).state;
    const cloud = { owned: 3 | (1 << 6), heart: 60 };
    const result = await restoreCompanion(cloud, 0, port);
    expect(result.state.claimed).toEqual(local.claimed);
    expect(result.state.heart).toBe(60);
    expect(ownsOutfit(result.state, "cream")).toBe(true);
    expect(ownsOutfit(result.state, "summer")).toBe(true);
    expect(mergeCompanion(result.state, { owned: 3, heart: 1 })).toEqual(
      result.state,
    );
  });
  it("rejects malformed clouds, ids, ledgers and out of range random results", () => {
    const p = initialCompanion();
    expect(decodeCompanion({ ...p, claimed: ["match:invalid"] })).toBeNull();
    expect(decodeCompanion({ ...p, owned: 2 })).toBeNull();
    expect(() => awardOutfit(p, "../bad", () => 0)).toThrow();
    expect(() => awardOutfit(p, "match:random", () => 22)).toThrow();
    expect(() => mergeCompanion(p, { owned: 3, heart: Infinity })).toThrow();
  });
  it("caps heart without altering ownership or match accounting", async () => {
    const port = storage();
    const result = await addHeart(100, port);
    expect(result.state).toEqual({
      schema: 1,
      owned: 3,
      heart: 100,
      claimed: [],
    });
  });
});
describe("outfit visual novels", () => {
  it("every outfit has 24 pages and exactly two choices with distinct local replies", () => {
    const openings = new Set();
    const answers = new Set();
    const invitations = new Set();
    for (const outfit of OUTFITS) {
      const a = datePages(outfit.id, [0, 0]),
        b = datePages(outfit.id, [1, 1]);
      expect(a).toHaveLength(24);
      expect(a.filter((p) => p.choice)).toHaveLength(2);
      expect(a[5].choice?.index).toBe(0);
      expect(a[17].choice?.index).toBe(1);
      expect(a[6].text).not.toBe(b[6].text);
      expect(a[18].text).not.toBe(b[18].text);
      expect(a[21]).toEqual(b[21]);
      expect(
        a.every(
          (p) => p.text.length > 0 && p.expression >= 0 && p.expression < 8,
        ),
      ).toBe(true);
      openings.add(a[0].text);
      answers.add(a[6].text);
      invitations.add(b[18].text);
    }
    expect(openings.size).toBe(24);
    expect(answers.size).toBe(24);
    expect(invitations.size).toBe(24);
  });
});
