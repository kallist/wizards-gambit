import { afterEach, expect, it, vi } from "vitest";
import { RoomClient } from "../src/platform/room";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("切换房间后忽略旧 WebSocket 的迟到消息（Mock 连接）", () => {
  vi.useFakeTimers();
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  const instances: FakeSocket[] = [];
  class FakeSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 0;
    onopen = () => {};
    onmessage = (_: { data: string }) => {};
    onerror = () => {};
    onclose = (_: { code: number }) => {};
    send = vi.fn();
    constructor(_url: string) {
      instances.push(this);
    }
    close() {
      this.readyState = 3;
      this.onclose({ code: 1000 });
    }
  }
  vi.stubGlobal("WebSocket", FakeSocket);
  const client = new RoomClient("ws://127.0.0.1:8787/socket"),
    error = vi.fn();
  client.onError = error;
  client.create("white", "magic");
  const old = instances[0];
  client.create("black", "magic");
  const current = instances[1];
  old.onopen();
  old.onmessage({ data: "invalid" });
  expect(old.send).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  current.readyState = 1;
  current.onopen();
  current.onmessage({
    data: JSON.stringify({
      type: "welcome",
      code: "ABC123",
      color: "black",
      token: "a".repeat(32),
    }),
  });
  old.onmessage({
    data: JSON.stringify({
      type: "welcome",
      code: "BAD123",
      color: "white",
      token: "b".repeat(32),
    }),
  });
  expect(client.saved()?.code).toBe("ABC123");
  expect(client.saved()?.color).toBe("black");
  client.close();
});
