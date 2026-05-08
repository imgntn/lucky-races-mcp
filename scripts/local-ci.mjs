#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const shell = process.platform === "win32";

function run(label, command, args) {
  console.log(`\n==> ${label}`);
  console.log(`$ ${[command, ...args].join(" ")}`);

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell,
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.LOCAL_CI_INSTALL === "1") {
  run("Install dependencies", "npm", ["ci"]);
}

run("Build", "npm", ["run", "build"]);

console.log("\nLocal CI passed.");
