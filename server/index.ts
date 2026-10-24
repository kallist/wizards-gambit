import { createServer, type IncomingMessage } from "node:http";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { applyAction, clone, createGame } from "../src/domain/engine";
import { other } from "../src/domain/types";
import type { Action, Color, GameState, RuleSet } from "../src/domain/types";

interface Seat {
  token: string;
  socket: WebSocket | null;
  ready: boolean;
  disconnectedAt: number | null;
}
interface Room {
  code: string;
  host: Color;
  rules: RuleSet;
  seats: Partial<Record<Color, Seat>>;
  game: GameState | null;
  matchId: string;
  touched: number;
  seen: Set<string>;
  rematch: Set<Color>;
}
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const token = () => randomBytes(24).toString("base64url");
const safeToken = (a: unknown, b: string) =>
  typeof a === "string" &&
  /^[A-Za-z0-9_-]{32}$/.test(a) &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const send = (ws: WebSocket, data: unknown) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
};

export function publicGame(
  source: GameState,
  viewer: Color,
): { state: GameState; enemyHandCount: number } {
  const state = clone(source),
    enemy = other(viewer),
    enemyHandCount = state.hands[enemy].length;
  state.hands[enemy] = state.hands[enemy].filter((c) =>
    state.revealed[enemy].includes(c.id),
  );
  state.rng = 0;
  state.repetitions = {};
  state.cardSerial = 0;
  return { state, enemyHandCount };
}

export function makeGameServer(
  options: {
    staticRoot?: string;
    allowedOrigins?: string[];
    maxRooms?: number;
  } = {},
) {
  const rooms = new Map<string, Room>(),
    connections = new Map<WebSocket, { room: Room; color: Color }>();
  const attempts = new Map<string, { count: number; reset: number }>();
  const staticRoot = resolve(options.staticRoot ?? "dist");
  const http = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.url === "/api/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    if (!["GET", "HEAD"].includes(req.method ?? "")) {
      res.writeHead(405).end();
      return;
    }
    try {
      const url = new URL(req.url ?? "/", "http://localhost"),
        decoded = decodeURIComponent(url.pathname);
      if (decoded.includes("\0")) {
        res.writeHead(400).end();
        return;
      }
      const target = resolve(
        staticRoot,
        "." + decoded + (decoded.endsWith("/") ? "index.html" : ""),
      );
      if (!target.startsWith(staticRoot + sep) && target !== staticRoot) {
        res.writeHead(403).end();
        return;
      }
      const info = await stat(target);
      if (!info.isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader(
        "Content-Type",
        MIME[extname(target)] ?? "application/octet-stream",
      );
      res.setHeader(
        "Cache-Control",
        extname(target) === ".html" ? "no-cache" : "public, max-age=3600",
      );
      if (req.method === "HEAD") res.end();
      else res.end(await readFile(target));
    } catch {
      res.writeHead(404).end("页面不存在");
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  const acceptedOrigins =
    options.allowedOrigins ??
    (
      process.env.ALLOWED_ORIGINS ??
      "http://localhost:5173,http://127.0.0.1:5173"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  http.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin;
    const own = [`http://${req.headers.host}`, `https://${req.headers.host}`];
    let pathname: string;
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      return;
    }
    if (
      pathname !== "/socket" ||
      !origin ||
      ![...acceptedOrigins, ...own].includes(origin)
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });

  const snapshot = (room: Room, color: Color) => ({
    type: "state",
    room: {
      code: room.code,
      host: room.host,
      rules: room.rules,
      matchId: room.matchId,
      players: (["white", "black"] as const).map((c) => ({
        color: c,
        joined: !!room.seats[c],
        online: room.seats[c]?.socket?.readyState === WebSocket.OPEN,
        ready: room.seats[c]?.ready ?? false,
      })),
      rematch: [...room.rematch],
    },
    playerColor: color,
    ...(room.game
      ? publicGame(room.game, color)
      : { state: null, enemyHandCount: 0 }),
  });
  const broadcast = (room: Room) => {
    for (const color of ["white", "black"] as const) {
      const seat = room.seats[color];
      if (seat?.socket) send(seat.socket, snapshot(room, color));
    }
  };
  const error = (ws: WebSocket, message: string, requestId?: unknown) =>
    send(ws, {
      type: "error",
      message,
      ...(typeof requestId === "string" ? { requestId } : {}),
    });
  const attach = (ws: WebSocket, room: Room, color: Color) => {
    const seat = room.seats[color]!;
    const previous = seat.socket;
    seat.socket = ws;
    seat.disconnectedAt = null;
    if (previous && previous !== ws) {
      connections.delete(previous);
      previous.close(4001, "已在另一连接恢复");
    }
    connections.set(ws, { room, color });
    room.touched = Date.now();
    send(ws, { type: "welcome", code: room.code, color, token: seat.token });
    broadcast(room);
  };
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    let windowStart = Date.now(),
      messages = 0;
    ws.on("error", () => undefined);
    ws.on("message", (raw) => {
      if (Date.now() - windowStart > 1000) {
        windowStart = Date.now();
        messages = 0;
      }
      if (++messages > 30) {
        error(ws, "操作太快，请稍后重试");
        return;
      }
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw.toString());
        if (!message || typeof message !== "object" || Array.isArray(message))
          throw new Error();
      } catch {
        error(ws, "消息格式无效");
        return;
      }
      try {
        if (message.type === "create") {
          if (connections.has(ws)) throw new Error("已经在房间中");
          if (rooms.size >= (options.maxRooms ?? 256))
            throw new Error("房间已满，请稍后重试");
          const ip = req.socket.remoteAddress ?? "unknown",
            now = Date.now();
          const rate = attempts.get(ip);
          if (rate && rate.reset > now && rate.count >= 10)
            throw new Error("创建太频繁，请一分钟后再试");
          attempts.set(ip, {
            count: rate && rate.reset > now ? rate.count + 1 : 1,
            reset: rate && rate.reset > now ? rate.reset : now + 60000,
          });
          const color: Color = message.color === "black" ? "black" : "white";
          let code: string;
          do {
            code = randomBytes(3).toString("hex").toUpperCase();
          } while (rooms.has(code));
          const room: Room = {
            code,
            host: color,
            rules: message.rules === "classic" ? "classic" : "magic",
            seats: {
              [color]: {
                token: token(),
                socket: null,
                ready: false,
                disconnectedAt: null,
              },
            },
            game: null,
            matchId: token(),
            touched: now,
            seen: new Set(),
            rematch: new Set(),
          };
          rooms.set(code, room);
          attach(ws, room, color);
          return;
        }
        if (message.type === "join") {
          if (connections.has(ws)) throw new Error("已经在房间中");
          if (
            typeof message.code !== "string" ||
            !/^[A-F0-9]{6}$/.test(message.code)
          )
            throw new Error("请输入六位房间码");
          const room = rooms.get(message.code);
          if (!room) throw new Error("房间不存在或已过期");
          if (message.token) {
            const color = (["white", "black"] as const).find(
              (c) =>
                room.seats[c] && safeToken(message.token, room.seats[c]!.token),
            );
            if (!color) throw new Error("重连凭证无效");
            attach(ws, room, color);
            return;
          }
          const color = other(room.host);
          if (room.seats[color]) throw new Error("房间已满");
          room.seats[color] = {
            token: token(),
            socket: null,
            ready: false,
            disconnectedAt: null,
          };
          attach(ws, room, color);
          return;
        }
        const connection = connections.get(ws);
        if (!connection) throw new Error("请先加入房间");
        const { room, color } = connection;
        room.touched = Date.now();
        if (message.type === "ready") {
          if (room.game) throw new Error("对局已开始");
          room.seats[color]!.ready = message.ready === true;
          if (room.seats.white?.ready && room.seats.black?.ready)
            room.game = createGame(room.rules, randomInt(1, 0xffffffff));
          broadcast(room);
          return;
        }
        if (message.type === "rematch") {
          if (!room.game?.result) throw new Error("对局尚未结束");
          room.rematch.add(color);
          if (room.rematch.size === 2) {
            room.game = createGame(room.rules, randomInt(1, 0xffffffff));
            room.matchId = token();
            room.seen.clear();
            room.rematch.clear();
          }
          broadcast(room);
          return;
        }
        if (message.type === "action") {
          if (!room.game) throw new Error("请等待双方准备");
          if (
            typeof message.id !== "string" ||
            !/^[\w-]{1,80}$/.test(message.id)
          )
            throw new Error("请求编号无效");
          if (message.matchId !== room.matchId)
            throw new Error("这是上一局的操作，请刷新局面");
          const key = `${color}:${message.id}`;
          if (room.seen.has(key)) {
            send(ws, { type: "ack", id: message.id });
            send(ws, snapshot(room, color));
            return;
          }
          if (room.game.turn !== color) throw new Error("还没有轮到你");
          if (message.version !== room.game.version)
            throw new Error("局面已经变化，请重试");
          // Synchronous validation + replacement makes each accepted action indivisible.
          const next = applyAction(room.game, message.action as Action);
          room.game = next;
          room.seen.add(key);
          if (room.seen.size > 256)
            room.seen.delete(room.seen.values().next().value!);
          send(ws, { type: "ack", id: message.id });
          broadcast(room);
          return;
        }
        if (message.type === "sync") {
          send(ws, snapshot(room, color));
          return;
        }
        throw new Error("未知房间操作");
      } catch (e) {
        error(ws, e instanceof Error ? e.message : "操作失败", message.id);
      }
    });
    ws.on("close", () => {
      const connection = connections.get(ws);
      connections.delete(ws);
      if (
        connection &&
        connection.room.seats[connection.color]?.socket === ws
      ) {
        const seat = connection.room.seats[connection.color]!;
        seat.socket = null;
        seat.disconnectedAt = Date.now();
        broadcast(connection.room);
      }
    });
  });
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const expired =
        Object.values(room.seats).some(
          (s) => s.disconnectedAt && now - s.disconnectedAt > 300000,
        ) || now - room.touched > 7200000;
      if (expired) {
        for (const seat of Object.values(room.seats)) {
          if (seat.socket) {
            error(seat.socket, "房间已过期，请重新创建");
            seat.socket.close(4002);
          }
        }
        rooms.delete(code);
      }
    }
    for (const [ip, a] of attempts) if (a.reset < now) attempts.delete(ip);
  }, 30000);
  sweep.unref();
  return {
    http,
    rooms,
    close: async () => {
      clearInterval(sweep);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((done) => wss.close(() => done()));
      await new Promise<void>((done) => http.close(() => done()));
    },
  };
}

const ownPath = resolve(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === ownPath) {
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT 必须为有效端口");
  const server = makeGameServer();
  server.http.listen(port, "0.0.0.0", () =>
    console.log(`巫师棋服务已启动，端口 ${port}`),
  );
}
