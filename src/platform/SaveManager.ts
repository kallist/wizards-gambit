import {
  AccountChangedError,
  CloudSaveError,
  CloudSnapshots,
  type CloudCandidate,
} from "./cloudSnapshots";
import {
  capturePlayerSave,
  mergePlayerSaves,
  writePlayerSave,
  type PlayerSave,
} from "./saveModel";
import type { PlayerStorage } from "./playerStorage";

/** One connected account. The UI holds an exclusive play lease for this scope. */
export class SaveManager {
  candidates: CloudCandidate[] = [];
  warnings: string[] = [];
  private flight: Promise<void> | null = null;
  active = true;
  lastSyncStarted = 0;
  constructor(
    readonly storage: PlayerStorage,
    private cloud: CloudSnapshots,
  ) {}
  async checkAccount() {
    await this.cloud.checkAccount();
  }
  async read() {
    const result = await this.cloud.read(capturePlayerSave(this.storage));
    if (!this.active) throw new AccountChangedError("账号连接已结束");
    this.candidates = result.candidates;
    this.warnings = result.warnings;
    return result;
  }
  async restore() {
    const result = await this.read();
    // A move/tap may have happened while the network was reading. Capture again.
    this.adopt(mergePlayerSaves(capturePlayerSave(this.storage), result.save));
    return result.found;
  }
  adopt(save: PlayerSave) {
    if (!this.active) throw new AccountChangedError("账号连接已结束");
    // Keep one local rollback copy before every explicit/cloud adoption.
    this.storage.setMeta(
      "before-restore",
      JSON.stringify(capturePlayerSave(this.storage)),
    );
    writePlayerSave(this.storage, save);
  }
  sync(): Promise<void> {
    if (this.flight) return this.flight;
    const run = async () => {
      if (!navigator.locks)
        throw new CloudSaveError("当前入口缺少安全存档锁，请导出本机备份");
      await navigator.locks.request(
        `wizard-cloud:${this.storage.scope}`,
        async () => {
          if (!this.active) throw new AccountChangedError("账号连接已结束");
          this.lastSyncStarted = Date.now();
          const revision = this.storage.getMeta("changed");
          await this.cloud.write(capturePlayerSave(this.storage));
          if (!this.active) throw new AccountChangedError("账号连接已结束");
          this.storage.setMeta("synced", String(Date.now()));
          // New local changes during the upload must stay pending for another run.
          if (revision === this.storage.getMeta("changed"))
            this.storage.removeMeta("dirty");
        },
      );
    };
    this.flight = run().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
}
