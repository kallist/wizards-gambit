import { validCompanionCloud } from "../story/companion";
import {
  MAX_SAVE_BYTES,
  decodePlayerSave,
  mergePlayerSaves,
  validProgress,
  withCore,
  type PlayerSave,
} from "./saveModel";
import type { Progress, ToySDK } from "./toy";

const CHUNK_BYTES = 900;
export class CloudSaveError extends Error {}
export class AccountChangedError extends CloudSaveError {}
export async function bounded<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new CloudSaveError("云端连接超时，本机待同步数据已保留")),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export interface CloudIdentity {
  owner: string;
  device: string;
  /** Verify current account and cancellation before and after each cloud operation. */
  verify: () => Promise<void>;
}
interface Commit {
  v: 2;
  owner: string;
  device: string;
  id: string;
  savedAt: number;
  progress: Progress;
  snapshot: { parts: number; hash: string; codec: "gzip" | "plain" } | null;
}
export interface CloudCandidate {
  id: string;
  device: string;
  savedAt: number;
  save: PlayerSave;
}
export interface CloudRead {
  save: PlayerSave;
  candidates: CloudCandidate[];
  warnings: string[];
  found: boolean;
}
const bytes = (s: string) => new TextEncoder().encode(s).length;
export const randomSaveId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
export async function sha256(s: string) {
  if (!crypto.subtle)
    throw new CloudSaveError("当前入口不支持安全云存档，请先导出本机备份");
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function toyOwner(sdk: ToySDK) {
  if (!sdk.getUserProfile)
    throw new CloudSaveError(
      "当前入口暂不支持账号存档，可先在本机游玩并导出备份",
    );
  const p = await bounded(sdk.getUserProfile());
  if (
    typeof p?.toyOpenId !== "string" ||
    !p.toyOpenId.trim() ||
    p.toyOpenId.length > 256
  )
    throw new CloudSaveError(
      "当前入口未提供可验证的账号存档身份，可先使用本机备份",
    );
  return sha256(p.toyOpenId);
}
const prefix = (owner: string) => `wg2_${owner.slice(0, 20)}_`;
const base = (c: Pick<Commit, "owner" | "device">) =>
  `${prefix(c.owner)}${c.device}`;
const commitKey = (c: Commit) => `${base(c)}_m_${c.id}`;
const chunkKey = (c: Commit, index: number) => `${base(c)}_s_${c.id}_${index}`;
function parseCommit(key: string, value: string, owner: string): Commit | null {
  try {
    if (bytes(value) > 1024) return null;
    const c = JSON.parse(value) as Commit;
    if (
      c.v !== 2 ||
      c.owner !== owner ||
      !/^[a-f0-9]{32}$/.test(c.device) ||
      !/^[a-f0-9]{32}$/.test(c.id) ||
      !Number.isSafeInteger(c.savedAt) ||
      c.savedAt < 0 ||
      key !== commitKey(c) ||
      !validProgress(c.progress) ||
      !validCompanionCloud(c.progress.companion) ||
      (c.snapshot !== null &&
        (!c.snapshot ||
          !Number.isInteger(c.snapshot.parts) ||
          c.snapshot.parts < 1 ||
          c.snapshot.parts > 125 ||
          !/^[a-f0-9]{64}$/.test(c.snapshot.hash) ||
          !["gzip", "plain"].includes(c.snapshot.codec)))
    )
      return null;
    return c;
  } catch {
    return null;
  }
}
async function streamBytes(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const blocks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_SAVE_BYTES) throw new CloudSaveError("云备份体积无效");
      blocks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const b of blocks) {
    data.set(b, offset);
    offset += b.length;
  }
  return data;
}
async function encode(save: PlayerSave, owner: string) {
  const plain = JSON.stringify({ owner, save: decodePlayerSave(save) });
  if (bytes(plain) > MAX_SAVE_BYTES)
    throw new CloudSaveError("完整备份过大，请导出文件备份");
  let data = new TextEncoder().encode(plain),
    codec: "gzip" | "plain" = "plain";
  if (typeof CompressionStream !== "undefined") {
    data = await streamBytes(
      new Blob([data]).stream().pipeThrough(new CompressionStream("gzip")),
    );
    codec = "gzip";
  }
  let binary = "";
  for (let i = 0; i < data.length; i += 0x8000)
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  const encoded = btoa(binary);
  return { encoded, codec, hash: await sha256(encoded) };
}
async function decode(c: Commit, cloud: Record<string, string>) {
  if (!c.snapshot) return null;
  const chunks = Array.from(
    { length: c.snapshot.parts },
    (_, i) => cloud[chunkKey(c, i)],
  );
  if (chunks.some((x) => typeof x !== "string" || bytes(x) > CHUNK_BYTES))
    throw new CloudSaveError("备份分片尚未完整");
  const encoded = chunks.join("");
  if (
    !/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded) ||
    (await sha256(encoded)) !== c.snapshot.hash
  )
    throw new CloudSaveError("备份校验不符");
  const raw = Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0));
  const data =
    c.snapshot.codec === "gzip"
      ? await streamBytes(
          new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip")),
        )
      : raw;
  if (data.length > MAX_SAVE_BYTES) throw new CloudSaveError("备份体积无效");
  const parsed = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(data),
  );
  if (parsed?.owner !== c.owner) throw new CloudSaveError("备份账号不符");
  return decodePlayerSave(parsed.save);
}
/** Immutable commits prevent stale responses from replacing a newer fixed key. */
export class CloudSnapshots {
  async checkAccount() {
    await this.identity.verify();
  }
  constructor(
    private sdk: ToySDK,
    private identity: CloudIdentity,
  ) {
    if (
      !/^[a-f0-9]{64}$/.test(identity.owner) ||
      !/^[a-f0-9]{32}$/.test(identity.device)
    )
      throw new CloudSaveError("存档身份无效");
  }
  private async rpc<T>(call: () => Promise<T>) {
    await this.identity.verify();
    const result = await bounded(call());
    await this.identity.verify();
    return result;
  }
  private async all() {
    const values = await this.rpc(() => this.sdk.getCloudStorage());
    if (
      !values ||
      typeof values !== "object" ||
      Array.isArray(values) ||
      Object.keys(values).length > 128 ||
      Object.values(values).some(
        (v) => typeof v !== "string" || bytes(v) > 1024,
      )
    )
      throw new CloudSaveError("云存档格式异常，已暂停写入");
    return values;
  }
  private async readValues(
    local: PlayerSave,
    values: Record<string, string>,
  ): Promise<CloudRead> {
    let save = local;
    const candidates: CloudCandidate[] = [],
      warnings: string[] = [];
    let found = false;
    if (values.progress_v1 !== undefined) {
      let p: Progress;
      try {
        p = JSON.parse(values.progress_v1);
      } catch {
        throw new CloudSaveError("旧云档格式异常，已停止覆盖");
      }
      if (
        !validProgress(p) ||
        (p.companion !== undefined && !validCompanionCloud(p.companion))
      )
        throw new CloudSaveError("旧云档格式异常，已停止覆盖");
      save = withCore(save, p);
      found = true;
    }
    const entries = Object.entries(values).filter(
      ([k]) => k.startsWith(prefix(this.identity.owner)) && k.includes("_m_"),
    );
    const commits: Commit[] = [];
    for (const [key, value] of entries) {
      const c = parseCommit(key, value, this.identity.owner);
      if (!c) {
        warnings.push("一份云备份清单无效，已保留原件");
        continue;
      }
      commits.push(c);
      save = withCore(save, c.progress);
      found = true;
    }
    if (entries.length && !commits.length)
      throw new CloudSaveError("云备份清单损坏，已停止写入，请导入备份文件");
    for (const c of commits.sort(
      (a, b) => b.savedAt - a.savedAt || b.id.localeCompare(a.id),
    )) {
      try {
        const full = await decode(c, values);
        if (full) {
          candidates.push({
            id: c.id,
            device: c.device,
            savedAt: c.savedAt,
            save: full,
          });
          save = mergePlayerSaves(save, full);
        } else warnings.push("有一份进度备份尚未包含完整棋局");
      } catch {
        warnings.push("一份完整备份损坏或未写完，已回退到其他可用备份");
      }
    }
    return { save, candidates, warnings: [...new Set(warnings)], found };
  }
  async read(local: PlayerSave) {
    return this.readValues(local, await this.all());
  }
  async write(local: PlayerSave) {
    const values = await this.all();
    const read = await this.readValues(local, values);
    const save = read.save;
    const packed = await encode(save, this.identity.owner);
    const chunks =
      packed.encoded.match(new RegExp(`.{1,${CHUNK_BYTES}}`, "g")) ?? [];
    const ownCommits = Object.entries(values).flatMap(([key, value]) => {
      const c = parseCommit(key, value, this.identity.owner);
      return c?.device === this.identity.device ? [c] : [];
    });
    const c: Commit = {
      v: 2,
      owner: this.identity.owner,
      device: this.identity.device,
      id: randomSaveId(),
      savedAt: Math.max(
        Date.now(),
        save.savedAt,
        ...ownCommits.map((x) =>
          Math.min(Number.MAX_SAFE_INTEGER, x.savedAt + 1),
        ),
      ),
      progress: {
        ...save.progress,
        companion: { owned: save.companion.owned, heart: save.companion.heart },
      },
      snapshot: {
        parts: chunks.length,
        hash: packed.hash,
        codec: packed.codec,
      },
    };
    if (
      Object.keys(values).length + chunks.length + 1 > 128 ||
      chunks.length > 125
    ) {
      // At least record monotonic core progress if a small immutable slot remains.
      const covered = ownCommits.some(
        (x) =>
          x.progress.unlocked >= c.progress.unlocked &&
          x.progress.taps >= c.progress.taps &&
          x.progress.best >= c.progress.best &&
          (x.progress.companion!.owned | c.progress.companion!.owned) ===
            x.progress.companion!.owned &&
          x.progress.companion!.heart >= c.progress.companion!.heart,
      );
      if (Object.keys(values).length < 128 && !covered) {
        const core = { ...c, snapshot: null };
        const text = JSON.stringify(core);
        if (bytes(text) > 1024) throw new CloudSaveError("进度清单超限");
        await this.rpc(() =>
          this.sdk.setCloudStorage({ [commitKey(core)]: text }),
        );
      }
      throw new CloudSaveError("云空间不足，完整备份仍待同步，请导出本机备份");
    }
    const pieces = Object.fromEntries(
      chunks.map((value, i) => [chunkKey(c, i), value]),
    );
    await this.rpc(() => this.sdk.setCloudStorage(pieces));
    const checked = await this.rpc(() =>
      this.sdk.getCloudStorage(Object.keys(pieces)),
    );
    if (Object.entries(pieces).some(([k, v]) => checked[k] !== v))
      throw new CloudSaveError("云备份分片未确认，旧备份保留");
    const text = JSON.stringify(c);
    if (bytes(text) > 1024) throw new CloudSaveError("云备份清单超限");
    await this.rpc(() => this.sdk.setCloudStorage({ [commitKey(c)]: text }));
    const confirmed = await this.rpc(() =>
      this.sdk.getCloudStorage([commitKey(c)]),
    );
    if (confirmed[commitKey(c)] !== text)
      throw new CloudSaveError("云备份未确认，正在等待重试");
    // Never remove another device's commits. Keep two complete snapshots per writer.
    const old = ownCommits.sort(
      (a, b) => b.savedAt - a.savedAt || b.id.localeCompare(a.id),
    );
    const keep = old.find((x) =>
      read.candidates.some((candidate) => candidate.id === x.id),
    );
    const remove = old
      .filter((x) => x.id !== keep?.id)
      .flatMap((x) => [
        commitKey(x),
        ...Array.from({ length: x.snapshot?.parts ?? 0 }, (_, i) =>
          chunkKey(x, i),
        ),
      ]);
    const referenced = new Set([
      commitKey(c),
      ...Object.keys(pieces),
      ...(keep
        ? [
            commitKey(keep),
            ...Array.from({ length: keep.snapshot!.parts }, (_, i) =>
              chunkKey(keep, i),
            ),
          ]
        : []),
    ]);
    // Failed/unpublished chunks from this writer can be recovered only by retrying;
    // clean them only after the new full snapshot is confirmed.
    for (const key of Object.keys(values))
      if (
        key.startsWith(`${base(c)}_s_`) &&
        !referenced.has(key) &&
        !remove.includes(key)
      )
        remove.push(key);
    if (remove.length && this.sdk.removeCloudStorage) {
      try {
        await this.rpc(() => this.sdk.removeCloudStorage!(remove));
      } catch (error) {
        if (error instanceof AccountChangedError) throw error;
        // A cleanup failure must not invalidate the confirmed full backup.
      }
    }
    return { save, id: c.id, savedAt: c.savedAt };
  }
}
