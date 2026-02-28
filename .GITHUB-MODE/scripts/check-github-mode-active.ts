import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const activeFlagPath = path.join(process.cwd(), ".GITHUB-MODE", "ACTIVE.md");

if (!existsSync(activeFlagPath)) {
  console.error("GitHub Mode disabled by missing ACTIVE.md");
  process.exit(1);
}

console.log("GitHub Mode activation check passed (.GITHUB-MODE/ACTIVE.md present).");
