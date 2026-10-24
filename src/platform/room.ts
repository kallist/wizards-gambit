import { clone, validateSavedGame } from "../domain/engine";
import type { Action, Color, GameState, RuleSet } from "../domain/types";
import { getPlayerStorage } from "./playerStorage";

export interface RoomSnapshot {
  type: "state";
  room: {
    code: string;
    host: Color;
    rules: RuleSet;
    matchId: string;
    players: {
      color: Color;
      joined: boolean;
      online: boolean;
      ready: boolean;
    }[];
    rematch: Color[];
  };
  playerColor: Color;
  state: GameState | null;
  enemyHandCount: number;
}
export function validSnapshot(data: unknown): data is RoomSnapshot {
  if (!data || typeof data !== "object") return false;
  const x = data as RoomSnapshot,
    r = x.room;
  if (
    x.type !== "state" ||
    !r ||
    !/^[A-F0-9]{6}$/.test(r.code) ||
    !/^[\w-]{32}$/.test(r.matchId) ||
    !["white", "black"].includes(r.host) ||
    !["magic", "classic"].includes(r.rules) ||
    !["white", "black"].includes(x.playerColor) ||
    !Number.isInteger(x.enemyHandCount) ||
    x.enemyHandCount < 0 ||
    x.enemyHandCount > 4
  )
    return false;
  if (
    !Array.isArray(r.players) ||
    r.players.length !== 2 ||
    new Set(r.players.map((p) => p?.color)).size !== 2 ||
    r.players.some(
      (p) =>
        !p ||
        !["white", "black"].includes(p.color) ||
        ![p.joined, p.online, p.ready].every((v) => typeof v === "boolean"),
    )
  )
    return false;
  if (
    !Array.isArray(r.rematch) ||
    r.rematch.length > 2 ||
    r.rematch.some((c) => !["white", "black"].includes(c))
  )
    return false;
  return (
    x.state === null ||
    (validateSavedGame(x.state, true) &&
      x.state.rules === r.rules &&
      x.state.hands[x.playerColor === "white" ? "black" : "white"].length <=
        x.enemyHandCount)
  );
}

// Availability previews need the count of unknown cards, never their identities.
// This disposable view is never stored or sent as an authoritative game state.
export function rulesForViewer(
  state: GameState,
  viewer: Color,
  enemyHandCount: number,
): GameState {
  const copy = clone(state),
    enemy: Color = viewer === "white" ? "black" : "white";
  for (let i = copy.hands[enemy].length; i < Math.min(4, enemyHandCount); i++)
    copy.hands[enemy].push({
      id: `unknown-card-${i}`,
      spell: "protego",
      readyPly: 0,
    });
  return copy;
}
interface Credential {
  code: string;
  color: Color;
  token: string;
}
export type ConnectionStatus =
  "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";
const KEY = "wizards-gambit-room-v1";
export class RoomClient {
  private storage = getPlayerStorage();
  onState: (state: RoomSnapshot) => void = () => undefined;
  onError: (message: string) => void = () => undefined;
  onStatus: (status: ConnectionStatus) => void = () => undefined;
  private ws: WebSocket | null = null;
  private credential: Credential | null = null;
  private command: Record<string, unknown> | null = null;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  constructor(
    private url = import.meta.env.VITE_ROOM_SERVER ||
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/socket`,
  ) {}
  saved(): Credential | null {
    try {
      const c = JSON.parse(this.storage.getItem(KEY) ?? "null");
      if (
        c &&
        /^[A-F0-9]{6}$/.test(c.code) &&
        /^[\w-]{32}$/.test(c.token) &&
        ["white", "black"].includes(c.color)
      )
        return c;
    } catch {
      /* No credential. */
    }
    return null;
  }
  create(color: Color, rules: RuleSet) {
    this.credential = null;
    this.open({ type: "create", color, rules });
  }
  join(code: string) {
    this.credential = null;
    this.open({ type: "join", code: code.trim().toUpperCase() });
  }
  resume() {
    this.credential = this.saved();
    if (!this.credential) {
      this.onError("没有可恢复的房间");
      return;
    }
    this.open({
      type: "join",
      code: this.credential.code,
      token: this.credential.token,
    });
  }
  private open(command: Record<string, unknown>) {
    this.closed = false;
    this.command = command;
    if (this.timer) clearTimeout(this.timer);
    const previous = this.ws;
    this.ws = null;
    previous?.close();
    let ws: WebSocket;
    try {
      const url = new URL(this.url);
      if (!["ws:", "wss:"].includes(url.protocol)) throw new Error();
      ws = new WebSocket(url);
    } catch {
      this.onError("好友服务地址无效");
      this.onStatus("disconnected");
      return;
    }
    this.ws = ws;
    this.onStatus(this.retries ? "reconnecting" : "connecting");
    const timeout = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) ws.close();
    }, 10000);
    ws.onopen = () => {
      clearTimeout(timeout);
      if (this.ws !== ws || this.closed) return;
      this.onStatus("connected");
      ws.send(JSON.stringify(command));
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws || this.closed) return;
      try {
        if (typeof event.data !== "string" || event.data.length > 1500000)
          throw new Error();
        const data = JSON.parse(event.data);
        if (data.type === "welcome") {
          if (
            !/^[A-F0-9]{6}$/.test(data.code) ||
            !/^[\w-]{32}$/.test(data.token) ||
            !["white", "black"].includes(data.color)
          )
            throw new Error();
          this.credential = {
            code: data.code,
            color: data.color,
            token: data.token,
          };
          this.retries = 0;
          try {
            this.storage.setItem(KEY, JSON.stringify(this.credential));
          } catch {
            this.onError("浏览器无法保存重连凭证，刷新后可能无法恢复座位");
          }
        } else if (data.type === "state") {
          if (!validSnapshot(data)) throw new Error();
          this.onState(data as RoomSnapshot);
        } else if (data.type === "error")
          this.onError(
            typeof data.message === "string" ? data.message : "房间操作失败",
          );
      } catch {
        this.onError("房间数据格式异常，已停止使用该消息");
      }
    };
    ws.onerror = () => {
      if (this.ws === ws && !this.closed)
        this.onError("好友服务暂未连接，请检查服务是否启动");
    };
    ws.onclose = (event) => {
      clearTimeout(timeout);
      if (this.ws !== ws || this.closed) return;
      this.onStatus("disconnected");
      if (event.code === 4001 || event.code === 4002) {
        this.onError(
          event.code === 4001 ? "座位已在另一窗口恢复" : "房间已过期",
        );
        return;
      }
      if (this.credential && this.retries < 5) {
        const delay = Math.min(8000, 1000 * 2 ** this.retries++);
        this.onStatus("reconnecting");
        this.timer = setTimeout(
          () =>
            this.open({
              type: "join",
              code: this.credential!.code,
              token: this.credential!.token,
            }),
          delay,
        );
      }
    };
  }
  send(data: unknown) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.onError("连接尚未恢复，请稍后重试");
      return false;
    }
    this.ws.send(JSON.stringify(data));
    return true;
  }
  act(action: Action, version: number, matchId: string) {
    return this.send({
      type: "action",
      id:
        crypto.randomUUID?.() ??
        `action-${Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16)).join("")}`,
      version,
      matchId,
      action,
    });
  }
  close(forget = false) {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.onStatus("idle");
    if (forget) {
      this.credential = null;
      try {
        this.storage.removeItem(KEY);
      } catch {
        /* Best effort. */
      }
    }
  }
}
