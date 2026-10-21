import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const appData = process.env.APPDATA;
if (!appData) {
  console.error("APPDATA is required to locate the Zotero profile on Windows.");
  process.exit(1);
}
const profileRoot = join(appData, "Zotero", "Zotero", "Profiles");
const profile = process.argv[2] ?? "3jrybrub.default";
const logPath = join(profileRoot, profile, "annotation-markdown-debug.log");

if (!existsSync(logPath)) {
  console.log(`No annotation markdown debug log found at ${logPath}`);
  process.exit(1);
}

console.log(readFileSync(logPath, "utf8"));
