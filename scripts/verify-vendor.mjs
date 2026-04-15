#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const manifestPath = "vendor-packages/checksums.json";
if (!existsSync(manifestPath)) {
  console.log("[verify-vendor] no checksums.json — skipping");
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
let failed = false;
for (const [file, expected] of Object.entries(manifest)) {
  const path = join("vendor-packages", file);
  if (!existsSync(path)) {
    console.error(`[verify-vendor] missing: ${file}`);
    failed = true;
    continue;
  }
  const buf = readFileSync(path);
  const got = "sha256:" + createHash("sha256").update(buf).digest("hex");
  if (got !== expected) {
    console.error(`[verify-vendor] mismatch ${file}\n  expected ${expected}\n  got      ${got}`);
    failed = true;
  } else {
    console.log(`[verify-vendor] ok ${file}`);
  }
}
process.exit(failed ? 1 : 0);
