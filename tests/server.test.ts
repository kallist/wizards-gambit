import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { makeGameServer } from "../server/index";

type Message = Record<string, any>;
let server: ReturnType<typeof makeGameServer>, port: number;
const sockets: WebSocket[] = [];
async function client(serverPort = port) {
  const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/socket`, {
    origin: `http://127.0.0.1:${serverPort}`,
  });
  sockets.push(ws);
  const queue: Message[] = [],
    waiting: {
      test: (m: Message) => boolean;
      resolve: (m: Message) => void;
    }[] = [];
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    const index = waiting.findIndex((w) => w.test(m));
    if (index >= 0) waiting.splice(index, 1)[0].resolve(m);
    else queue.push(m);
  });
  await new Promise<void>((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  return {
    ws,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    next: (test: (m: Message) => boolean) => {
      const index = queue.findIndex(test);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise<Message>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("等待消息超时")), 2500);
        waiting.push({
          test,
          resolve: (m) => {
            clearTimeout(timer);
            resolve(m);
          },
        });
      });
    },
  };
}
beforeEach(async () => {
  server = makeGameServer();
  await new Promise<void>((done) => server.http.listen(0, "127.0.0.1", done));
  port = (server.http.address() as { port: number }).port;
});
afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await server.close();
});
async function start() {
  const a = await client(),
    b = await client();
  a.send({ type: "create", color: "white", rules: "magic" });
  const welcome = await a.next((m) => m.type === "welcome");
  b.send({ type: "join", code: welcome.code });
  const guest = await b.next((m) => m.type === "welcome");
  a.send({ type: "ready", ready: true });
  b.send({ type: "ready", ready: true });
  const state = await a.next((m) => m.type === "state" && m.state);
  await b.next((m) => m.type === "state" && m.state);
  return { a, b, welcome, guest, state };
}
describe("真实 WebSocket 权威房间（本机）", () => {
  it("畸形升级地址只拒绝该连接，服务进程和既有房间继续可用", async () => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        'import { makeGameServer } from "./server/index.ts"; const s = makeGameServer(); s.http.listen(0, "127.0.0.1", () => console.log(s.http.address().port));',
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    try {
      const childPort = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("隔离服务启动超时")),
          8000,
        );
        child.stdout.once("data", (data) => {
          clearTimeout(timer);
          resolve(Number(data.toString().trim()));
        });
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(new Error("隔离服务提前退出"));
        });
      });
      const a = await client(childPort);
      a.send({ type: "create", color: "white", rules: "magic" });
      const welcome = await a.next((m) => m.type === "welcome");
      const response = await new Promise<string>((resolve, reject) => {
        const socket = createConnection(childPort, "127.0.0.1");
        let text = "";
        socket.setTimeout(2000, () => {
          socket.destroy();
          reject(new Error("畸形升级请求未被有界关闭"));
        });
        socket.on("data", (data) => (text += data));
        socket.on("error", reject);
        socket.on("close", () => resolve(text));
        socket.on("connect", () =>
          socket.write(
            `GET http://[ HTTP/1.1\r\nHost: 127.0.0.1:${childPort}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nOrigin: http://127.0.0.1:${childPort}\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
          ),
        );
      });
      expect(response).toMatch(/^HTTP\/1\.1 400 /);
      expect(child.exitCode).toBeNull();
      expect((await fetch(`http://127.0.0.1:${childPort}/api/health`)).ok).toBe(
        true,
      );
      a.send({ type: "sync" });
      const state = await a.next((m) => m.type === "state");
      expect(state.room.code).toBe(welcome.code);
      expect(
        state.room.players.find((p: any) => p.color === "white").joined,
      ).toBe(true);
    } finally {
      if (child.exitCode === null) {
        const exited = new Promise<void>((resolve) =>
          child.once("exit", () => resolve()),
        );
        child.kill();
        await exited;
      }
    }
  });
  it("两端准备后开局，隐藏未知手牌、随机源和重复局面签名", async () => {
    const { state } = await start();
    expect(state.state.hands.white).toHaveLength(3);
    expect(state.state.hands.black).toHaveLength(0);
    expect(state.enemyHandCount).toBe(3);
    expect(state.state.rng).toBe(0);
    expect(state.state.repetitions).toEqual({});
    expect(JSON.stringify(state)).not.toContain("token");
  });
  it("同一请求重发不多走一步，过期版本被拒绝", async () => {
    const { a, b, state } = await start();
    const action = {
      type: "action",
      id: "move-1",
      version: 0,
      matchId: state.room.matchId,
      action: { type: "move", move: { from: 52, to: 36 } },
    };
    a.send(action);
    const moved = await a.next(
      (m) => m.type === "state" && m.state?.version === 1,
    );
    expect(moved.state.turn).toBe("black");
    a.send(action);
    await a.next((m) => m.type === "ack" && m.id === "move-1");
    const repeated = await a.next(
      (m) => m.type === "state" && m.state?.version === 1,
    );
    expect(repeated.state.ply).toBe(1);
    b.send({
      ...action,
      id: "move-2",
      action: { type: "move", move: { from: 12, to: 28 } },
    });
    expect((await b.next((m) => m.type === "error")).message).toContain(
      "局面已经变化",
    );
  });
  it("拒绝越权走棋和非法技能，保持版本", async () => {
    const { a, b, state } = await start();
    b.send({
      type: "action",
      id: "wrong-turn",
      version: 0,
      matchId: state.room.matchId,
      action: { type: "move", move: { from: 12, to: 28 } },
    });
    expect((await b.next((m) => m.type === "error")).message).toContain(
      "轮到你",
    );
    a.send({
      type: "action",
      id: "bad-spell",
      version: 0,
      matchId: state.room.matchId,
      action: { type: "cast", cast: { cardId: "__fake__", targets: [60] } },
    });
    await a.next((m) => m.type === "error");
    a.send({ type: "sync" });
    expect(
      (await a.next((m) => m.type === "state" && m.state)).state.version,
    ).toBe(0);
  });
  it("座位凭证能重连，无凭证不能挤掉已占座位", async () => {
    const { a, welcome } = await start();
    a.ws.close();
    const c = await client();
    c.send({ type: "join", code: welcome.code });
    expect((await c.next((m) => m.type === "error")).message).toContain("已满");
    c.send({ type: "join", code: welcome.code, token: welcome.token });
    expect((await c.next((m) => m.type === "welcome")).color).toBe("white");
    expect(
      (await c.next((m) => m.type === "state" && m.state)).state.version,
    ).toBe(0);
  });
  it("旧对局动作不能进入重赛", async () => {
    const { a, b, state } = await start();
    a.send({
      type: "action",
      id: "resign",
      version: 0,
      matchId: state.room.matchId,
      action: { type: "resign" },
    });
    await a.next((m) => m.type === "state" && m.state?.result);
    a.send({ type: "rematch" });
    b.send({ type: "rematch" });
    const next = await a.next(
      (m) =>
        m.type === "state" &&
        m.state &&
        !m.state.result &&
        m.room.matchId !== state.room.matchId,
    );
    expect(next.state.version).toBe(0);
    a.send({
      type: "action",
      id: "old",
      version: 0,
      matchId: state.room.matchId,
      action: { type: "move", move: { from: 52, to: 36 } },
    });
    expect((await a.next((m) => m.type === "error")).message).toContain(
      "上一局",
    );
  });
  it("拒绝不可信来源的连接", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/socket`, {
      origin: "https://untrusted.invalid",
    });
    sockets.push(ws);
    const message = await new Promise<string>((resolve) =>
      ws.on("error", (error) => resolve(error.message)),
    );
    expect(message).toContain("403");
  });
});
