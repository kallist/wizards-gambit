import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  // Software WebGL and fresh browser-context startup can exceed 45 seconds
  // on this host; keep every behavior assertion and a bounded 90s budget.
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:8788",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: {
      // Keep real WebGL via SwiftShader. This host's GPU compositor corrupts
      // layers after canvas teardown; CPU page compositing renders them correctly.
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-gpu-compositing",
      ],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server-dist/index.js",
    env: { PORT: "8788" },
    url: "http://127.0.0.1:8788/api/health",
    timeout: 30000,
    reuseExistingServer: false,
  },
});
