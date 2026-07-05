import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function bin(name) {
  const command = process.platform === "win32" ? `${name}.cmd` : name;
  const candidate = path.join(root, "node_modules", ".bin", command);
  if (!existsSync(candidate)) {
    throw new Error(`Missing build binary: ${candidate}. Run install before build.`);
  }
  return candidate;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(bin("tsc"), ["-p", "apps/api/tsconfig.json"]);
run(bin("tsc"), ["-b"], { cwd: path.join(root, "apps", "web") });
run(bin("vite"), ["build"], { cwd: path.join(root, "apps", "web") });
