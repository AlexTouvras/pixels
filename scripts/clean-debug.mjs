#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";

const PATTERNS = [
  "scripts/.vercel-*",
  "scripts/.generate-body.json",
  "scripts/.smoke-*.png",
  "scripts/.debug-cloud*",
];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function globSimple(root, pattern) {
  const dir = path.dirname(pattern);
  const base = path.basename(pattern);
  const fullDir = path.join(root, dir);
  if (!(await exists(fullDir))) return [];
  const entries = await fs.readdir(fullDir);
  const re = new RegExp(
    "^" + base.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$",
  );
  return entries.filter((e) => re.test(e)).map((e) => path.join(fullDir, e));
}

const root = process.cwd();
let removed = 0;
for (const pattern of PATTERNS) {
  for (const file of await globSimple(root, pattern)) {
    await fs.rm(file, { recursive: true, force: true });
    console.log("removed", path.relative(root, file));
    removed++;
  }
}
console.log(removed ? `clean-debug: ${removed} item(s)` : "clean-debug: nothing to remove");
