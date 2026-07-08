import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const introPath = path.join(root, "intro", "index.html");
const homePath = path.join(root, "index.html");

for (const file of [homePath, introPath]) {
  if (!existsSync(file)) {
    console.error(`Missing ${path.relative(root, file)}`);
    process.exitCode = 1;
  }
}

if (process.exitCode) process.exit();

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const url = pathToFileURL(introPath).href;
  const runs = [
    ["--yes", "playwright", "screenshot", "--full-page", "--viewport-size=1440,1000", url, "intro-desktop.png"],
    ["--yes", "playwright", "screenshot", "--full-page", "--viewport-size=390,844", url, "intro-mobile.png"],
  ];

  for (const args of runs) {
    const result = spawnSync(npx, args, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
      windowsHide: true,
    });
    if (result.status !== 0) {
      if (result.error) console.error(result.error.message);
      console.error("Browser screenshot verification failed.");
      process.exit(result.status || 1);
    }
  }

  console.log("Browser screenshot verification passed via npx.");
  process.exit();
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(`file://${introPath.replace(/\\/g, "/")}`);
await page.screenshot({ path: path.join(root, "intro-desktop.png"), fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: path.join(root, "intro-mobile.png"), fullPage: true });
await browser.close();

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Browser verification passed.");
