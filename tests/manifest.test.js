import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("addon manifest", () => {
  test("targets Zotero 9 and 10 without claiming Zotero 7 or 8 support", async () => {
    const manifestPath = path.join(process.cwd(), "addon", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

    expect(manifest.author).toBe("qrkks <34028312@qq.com>");
    expect(manifest.applications.zotero.id).toBe("zotero-annotation-markdown@34028312.qq.com");
    expect(manifest.applications.zotero.strict_min_version).toBe("9.0");
    expect(manifest.applications.zotero.strict_max_version).toBe("10.0.*");
    expect(manifest.applications.zotero.update_url).toBe(
      "https://raw.githubusercontent.com/qrkks/zotero-annotation-markdown/main/updates.json"
    );
  });

  test("declares an add-on manager icon", async () => {
    const manifestPath = path.join(process.cwd(), "addon", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

    expect(manifest.icons["16"]).toBe("icons/annotation-markdown.svg");
    expect(manifest.icons["32"]).toBe("icons/annotation-markdown.svg");
    expect(manifest.icons["48"]).toBe("icons/annotation-markdown.svg");
  });
});
