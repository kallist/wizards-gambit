import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LOCAL_URL = "http://localhost:8787/";

function openBrowser(url) {
  const [command, args] =
    process.platform === "win32"
      ? ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, {
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => console.log(`请在浏览器打开 ${url}`));
  child.unref();
}

async function existingGame(url) {
  try {
    const response = await fetch(new URL("api/health", url), {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok || (await response.json()).ok !== true) return false;
    const page = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return (
      page.ok && (await page.text()).includes("巫师棋：与马尔福的甜蜜生活")
    );
  } catch {
    return false;
  }
}

/** Keep one stable origin for player saves; never silently switch ports. */
export async function startLocalGame({ port = 8787, open = true } = {}) {
  const url = `http://localhost:${port}/`;
  if (port !== 0 && (await existingGame(url))) {
    console.log(`游戏已在运行：${url}`);
    if (open) openBrowser(url);
    return { url, reused: true, close: async () => {} };
  }
  try {
    await access(resolve(root, "dist/index.html"));
    await access(resolve(root, "server-dist/index.js"));
  } catch {
    throw new Error(
      "缺少构建文件。请先运行 npm ci 和 npm run build，再双击“开始游戏.cmd”。",
    );
  }
  let makeGameServer;
  try {
    ({ makeGameServer } = await import(
      pathToFileURL(resolve(root, "server-dist/index.js")).href
    ));
  } catch (error) {
    throw new Error("服务依赖未就绪，请运行 npm ci 后重试。", { cause: error });
  }
  const server = makeGameServer({ staticRoot: resolve(root, "dist") });
  try {
    await new Promise((done, reject) => {
      const failed = (error) => reject(error);
      server.http.once("error", failed);
      server.http.listen(port, "127.0.0.1", () => {
        server.http.off("error", failed);
        done();
      });
    });
  } catch (error) {
    await server.close().catch(() => {});
    if (error.code === "EADDRINUSE") {
      // Another double-click may have won the startup race.
      if (await existingGame(url)) {
        if (open) openBrowser(url);
        return { url, reused: true, close: async () => {} };
      }
      throw new Error(
        `端口${port}被其他程序占用。请先释放端口后重试；不会自动换地址，以免看不到原存档。`,
      );
    }
    throw error;
  }
  const actualUrl = `http://localhost:${server.http.address().port}/`;
  console.log(
    `游戏已启动：${actualUrl}\n此窗口保持打开；关闭窗口会停止本地服务。`,
  );
  if (open) openBrowser(actualUrl);
  return { url: actualUrl, reused: false, close: server.close };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const game = await startLocalGame({
      open: !process.argv.includes("--no-open"),
    });
    if (!game.reused) {
      let closing = false;
      const close = async () => {
        if (closing) return;
        closing = true;
        await game.close();
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
