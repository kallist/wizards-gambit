import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CloudSnapshots,
  AccountChangedError,
  randomSaveId,
  toyOwner,
} from "./cloudSnapshots";
import {
  getPlayerStorage,
  createTemporaryStorage,
  PLAYER_CHANGE,
  PLAYER_KEYS,
  selectPlayerScope,
  type PlayerStorage,
} from "./playerStorage";
import {
  backupFile,
  capturePlayerSave,
  decodePlayerSave,
  mergePlayerSaves,
  parseBackupFile,
  recoverLocalRestore,
  writePlayerSave,
  renewReadingIntent,
  type PlayerSave,
} from "./saveModel";
import { isToyHost, loadToy } from "./toy";
import { SaveManager } from "./SaveManager";

interface SaveContextValue {
  storage: PlayerStorage;
  original: Record<string, string | null> | null;
  manager: SaveManager | null;
  status: string;
  busy: boolean;
  run: (task: () => Promise<void>) => void;
  remount: () => void;
  disconnect: () => void;
  report: (message: string) => void;
}
const SaveContext = createContext<SaveContextValue | null>(null);
export function usePlayerSave() {
  const value = useContext(SaveContext);
  if (!value) throw new Error("存档入口未就绪");
  return value;
}
const errorMessage = (e: unknown) =>
  e instanceof Error
    ? e.message
    : (e as { type?: string })?.type === "user_denied"
      ? "你取消了账号授权，可使用本机存档"
      : (e as { type?: string })?.type === "not_logged_in"
        ? "请先登录哔哩哔哩，再连接账号存档"
        : "云端暂不可用，本机待同步数据已保留";
function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const originalData = (port: PlayerStorage) =>
  Object.fromEntries(
    Object.values(PLAYER_KEYS).map((key) => [key, port.getItem(key)]),
  );
function downloadOriginal(data: Record<string, string | null>) {
  download(
    JSON.stringify({ format: "wizard-chess-legacy-original", data }, null, 2),
    "wizard-chess-original.json",
  );
}
const temporaryStatus =
  "隔离临时游玩；原持久档未改动。刷新或关闭页面会丢失未导出的临时进度，请先导出备份文件。";
export function SaveBoundary({ children }: { children: ReactNode }) {
  const [toy] = useState(isToyHost);
  const [storage, setStorage] = useState<PlayerStorage | null>(null);
  const [original, setOriginal] = useState<Record<
    string,
    string | null
  > | null>(null);
  const [manager, setManager] = useState<SaveManager | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const epoch = useRef(0),
    lease = useRef<(() => void) | null>(null),
    current = useRef<SaveManager | null>(null);
  const repair = useRef<PlayerStorage>(getPlayerStorage("local"));
  const repairFile = useRef<HTMLInputElement>(null);
  const disconnect = () => {
    epoch.current++;
    if (current.current) current.current.active = false;
    current.current = null;
    lease.current?.();
    lease.current = null;
    setManager(null);
    setStorage(null);
    setOriginal(null);
    setBusy(false);
    setStatus("账号连接已结束，请重新连接后继续");
  };
  const chooseTemporary = (source: PlayerStorage, repaired?: PlayerSave) => {
    const raw = originalData(source),
      port = createTemporaryStorage();
    // Copy only player data, never room credentials. Recovery runs on the copy.
    for (const [key, value] of Object.entries(raw))
      if (value !== null) port.setItem(key, value);
    if (repaired) writePlayerSave(port, repaired);
    else {
      const pending = source.getMeta("restore");
      if (pending) port.setMeta("restore", pending);
      recoverLocalRestore(port);
    }
    capturePlayerSave(port); // A corrupt source never mounts App or writes defaults.
    selectPlayerScope("temporary");
    setOriginal(raw);
    setStorage(port);
    setStatus(temporaryStatus);
  };
  const chooseLocal = (scope: string) => {
    const port = getPlayerStorage(scope);
    repair.current = port;
    if (!navigator.locks) {
      chooseTemporary(port);
      return;
    }
    recoverLocalRestore(port);
    capturePlayerSave(port);
    selectPlayerScope(scope);
    setStorage(port);
    setOriginal(null);
    setStatus(
      scope === "local"
        ? "本机自动保存；建议定期导出备份"
        : "本机访客存档；尚未连接账号",
    );
  };
  useEffect(() => {
    if (!toy)
      try {
        chooseLocal("local");
      } catch (e) {
        setStatus(errorMessage(e));
      }
    return () => {
      if (current.current) current.current.active = false;
      lease.current?.();
    };
  }, [toy]);
  const connect = async () => {
    const ticket = ++epoch.current;
    setBusy(true);
    setStatus("正在核对账号并恢复存档…");
    const acquired: { release?: () => void } = {};
    try {
      const sdk = await loadToy();
      const owner = await toyOwner(sdk); // The first authorization is a user gesture.
      if (ticket !== epoch.current) return;
      if (!navigator.locks)
        throw new Error("当前入口缺少安全存档锁，可先在本机游玩并导出备份");
      let accepted = false;
      await new Promise<void>((resolve, reject) => {
        void navigator.locks
          .request(
            `wizard-play:${owner}`,
            { ifAvailable: true },
            async (lock) => {
              if (!lock) {
                reject(
                  new Error("此账号已在另一个窗口游玩，请关闭那个窗口后重试"),
                );
                return;
              }
              accepted = true;
              await new Promise<void>((done) => {
                acquired.release = done;
                resolve();
              });
            },
          )
          .catch(reject);
      });
      if (!accepted || ticket !== epoch.current) {
        acquired.release?.();
        return;
      }
      const port = getPlayerStorage(owner);
      repair.current = port;
      recoverLocalRestore(port);
      let device = port.getMeta("device");
      if (!device || !/^[a-f0-9]{32}$/.test(device)) {
        device = randomSaveId();
        port.setMeta("device", device);
      }
      const next = new SaveManager(
        port,
        new CloudSnapshots(sdk, {
          owner,
          device,
          verify: async () => {
            if (ticket !== epoch.current || (await toyOwner(sdk)) !== owner)
              throw new AccountChangedError(
                "B站账号已变化，请重新连接；原账号本机存档已保留",
              );
          },
        }),
      );
      const restored = await next.restore(); // Restore before App mounts or writes defaults.
      if (ticket !== epoch.current) {
        acquired.release?.();
        return;
      }
      lease.current = acquired.release ?? null;
      current.current = next;
      selectPlayerScope(owner);
      setManager(next);
      setStorage(port);
      setOriginal(null);
      setStatus(
        `${restored ? "已合并账号存档" : "账号已连接"}${next.warnings.length ? "；" + next.warnings.join("；") : ""}`,
      );
    } catch (e) {
      acquired.release?.();
      setStatus(errorMessage(e));
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  };
  const run = (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    void task()
      .catch((e) => {
        if (e instanceof AccountChangedError) disconnect();
        setStatus(errorMessage(e));
      })
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    if (!manager || !storage) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      failures = 0;
    const schedule = (delay = 1500) => {
      clearTimeout(timer);
      timer = setTimeout(sync, delay);
    };
    const sync = () => {
      if (stopped || !storage.getMeta("dirty")) return;
      const wait = 5000 - (Date.now() - manager.lastSyncStarted);
      if (wait > 0) {
        schedule(wait);
        return;
      }
      setStatus("本机已保存，正在同步…");
      void manager
        .sync()
        .then(() => {
          if (stopped) return;
          failures = 0;
          setStatus(
            storage.getMeta("dirty")
              ? "本机已保存，仍有新变化待同步"
              : "完整存档已同步",
          );
          if (storage.getMeta("dirty")) schedule();
        })
        .catch((e) => {
          if (stopped) return;
          if (e instanceof AccountChangedError) {
            disconnect();
            setStatus(errorMessage(e));
            return;
          }
          setStatus(errorMessage(e));
          // Bounded retry interval; the persistent dirty flag survives a restart.
          schedule(Math.min(60000, 5000 * 2 ** Math.min(failures++, 4)));
        });
    };
    const change = (event: Event) => {
      if ((event as CustomEvent).detail?.scope === storage.scope) {
        setStatus("本机已保存，变化待同步");
        schedule();
      }
    };
    const online = () => schedule(0);
    const visible = () => {
      if (document.visibilityState === "visible") {
        void manager
          .checkAccount()
          .then(() => schedule(0))
          .catch((e) => {
            if (stopped) return;
            if (e instanceof AccountChangedError) disconnect();
            setStatus(errorMessage(e));
          });
      }
    };
    window.addEventListener(PLAYER_CHANGE, change);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener(PLAYER_CHANGE, change);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [manager, storage]);
  if (!storage)
    return (
      <main className="save-gate">
        <div className="save-gate-card">
          <span className="eyebrow">KEEP OUR LITTLE STORY</span>
          <h1>把故事，好好收起来</h1>
          <p>
            {toy
              ? "连接B站账号后，先找回你们的进度，再开始今晚的约棋。"
              : "正在检查本机存档。"}
          </p>
          <p role="status">{status}</p>
          {toy && (
            <button
              className="button primary full"
              disabled={busy}
              onClick={() => void connect()}
            >
              连接B站存档
            </button>
          )}
          <button
            className="button full"
            disabled={busy}
            onClick={() => {
              try {
                chooseLocal("guest");
              } catch (e) {
                setStatus(errorMessage(e));
              }
            }}
          >
            使用本机访客存档
          </button>
          <button
            className="text-button"
            onClick={() => {
              downloadOriginal(originalData(repair.current));
            }}
          >
            导出原本机档原件
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => repairFile.current?.click()}
          >
            从备份文件修复当前本机档
          </button>
          <input
            ref={repairFile}
            type="file"
            hidden
            accept=".json,application/json"
            aria-label="选择修复备份"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              if (!selected || busy) return;
              setBusy(true);
              void (async () => {
                if (selected.size > 1_300_000) throw new Error("备份文件过大");
                const save = parseBackupFile(await selected.text()),
                  port = repair.current;
                if (!navigator.locks) {
                  chooseTemporary(port, save);
                  return;
                }
                port.setMeta(
                  "original-before-repair",
                  JSON.stringify(
                    Object.fromEntries(
                      Object.values(PLAYER_KEYS).map((k) => [
                        k,
                        port.getItem(k),
                      ]),
                    ),
                  ),
                );
                writePlayerSave(port, save);
                setStatus(
                  "本机档已从文件修复；请重新连接账号或选择本机访客存档",
                );
                if (!toy && port.scope === "local") chooseLocal("local");
              })()
                .catch((e) => setStatus(errorMessage(e)))
                .finally(() => setBusy(false));
            }}
          />
          <small>
            本机档依赖当前浏览器。云端未连接或空间不足时，请保留备份文件。
          </small>
        </div>
      </main>
    );
  return (
    <SaveContext.Provider
      value={{
        storage,
        original,
        manager,
        status,
        busy,
        run,
        remount: () => setGeneration((n) => n + 1),
        disconnect,
        report: setStatus,
      }}
    >
      {original && (
        <aside
          role="note"
          aria-label="临时存档提示"
          style={{
            position: "relative",
            zIndex: 1,
            padding: "10px 16px",
            background: "var(--panel)",
            borderBottom: "1px solid var(--line)",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {temporaryStatus} 可在设置中导出临时备份和原持久档原件。
        </aside>
      )}
      <div key={`${storage.scope}:${generation}`}>{children}</div>
    </SaveContext.Provider>
  );
}
export function SaveControls() {
  const {
    storage,
    original,
    manager,
    status,
    busy,
    run,
    remount,
    disconnect,
    report,
  } = usePlayerSave();
  const [message, setMessage] = useState("");
  useEffect(() => {
    const clear = (e: Event) => {
      if ((e as CustomEvent).detail?.scope === storage.scope) setMessage("");
    };
    window.addEventListener(PLAYER_CHANGE, clear);
    return () => window.removeEventListener(PLAYER_CHANGE, clear);
  }, [storage]);
  const file = useRef<HTMLInputElement>(null);
  const adopt = (save: ReturnType<typeof capturePlayerSave>) => {
    if (manager) manager.adopt(save);
    else {
      storage.setMeta(
        "before-restore",
        JSON.stringify(capturePlayerSave(storage)),
      );
      // Local import uses exactly the same journalled restore path.
      importLocal(save);
    }
    remount();
  };
  const importLocal = (save: ReturnType<typeof capturePlayerSave>) =>
    writePlayerSave(storage, save);
  return (
    <section className="save-controls" aria-label="玩家存档">
      <strong>
        {manager
          ? "B站账号存档"
          : original
            ? "隔离临时游玩"
            : "本机进度 · 自动保存"}
      </strong>
      <p role="status">{status}</p>
      {message && <p>{message}</p>}
      <p>
        章节、衣装、心动、番外选择、个人设置与未完棋局。好友棋室凭据仅留在本机。
      </p>
      {manager && (
        <div className="two-buttons">
          <button
            className="button compact"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await manager.sync();
                report(
                  storage.getMeta("dirty")
                    ? "新变化仍待同步"
                    : "完整存档已同步",
                );
              })
            }
          >
            立即同步
          </button>
          <button
            className="button compact"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await manager.restore();
                report(
                  "已合并云端存档" +
                    (manager.warnings.length
                      ? "；" + manager.warnings.join("；")
                      : ""),
                );
                remount();
              })
            }
          >
            合并云端存档
          </button>
        </div>
      )}
      <div className="two-buttons">
        <button
          className="button compact"
          disabled={busy}
          onClick={() => {
            try {
              download(
                backupFile(capturePlayerSave(storage)),
                "wizard-chess-backup.json",
              );
              setMessage("备份文件已生成，请保留下载文件");
            } catch (e) {
              setMessage(errorMessage(e));
            }
          }}
        >
          导出备份文件
        </button>
        <button
          className="button compact"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          导入备份文件
        </button>
      </div>
      {original && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => downloadOriginal(original)}
        >
          导出原持久档原件
        </button>
      )}
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        aria-label="选择存档备份文件"
        hidden
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (!selected) return;
          run(async () => {
            if (selected.size > 1_300_000) throw new Error("备份文件过大");
            const incoming = parseBackupFile(await selected.text());
            adopt(mergePlayerSaves(capturePlayerSave(storage), incoming));
          });
        }}
      />
      {manager && (
        <>
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const original = capturePlayerSave(getPlayerStorage("local"));
                adopt(mergePlayerSaves(capturePlayerSave(storage), original));
              })
            }
          >
            将旧本机档合并到此账号
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const guest = capturePlayerSave(getPlayerStorage("guest"));
                adopt(mergePlayerSaves(capturePlayerSave(storage), guest));
              })
            }
          >
            将访客进度合并到此账号
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await manager.read();
                setMessage("可恢复的云端棋局已刷新");
              })
            }
          >
            查看云端棋局
          </button>
          <div className="cloud-session-list">
            {manager.candidates
              .filter((c) => c.save.session)
              .map((c) => (
                <button
                  key={c.id}
                  className="button compact"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const local = capturePlayerSave(storage);
                      adopt({
                        ...mergePlayerSaves(local, c.save),
                        session: c.save.session,
                      });
                    })
                  }
                >
                  恢复棋局 · {new Date(c.savedAt).toLocaleString()} ·{" "}
                  {c.save.session!.state.history.length}条棋谱
                </button>
              ))}
          </div>
        </>
      )}
      {storage.getMeta("before-restore") && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const previous = decodePlayerSave(
                JSON.parse(storage.getMeta("before-restore")!),
              );
              adopt(renewReadingIntent(previous));
            })
          }
        >
          恢复合并前的本机备份
        </button>
      )}
      {isToyHost() && (
        <button className="text-button" disabled={busy} onClick={disconnect}>
          断开并切换账号
        </button>
      )}
      <small>
        {original
          ? temporaryStatus
          : "已连接时自动同步。清理浏览器或更换设备前，请确认完整存档已同步，或导出文件备份。"}
      </small>
    </section>
  );
}
