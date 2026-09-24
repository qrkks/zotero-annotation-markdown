import { describe, expect, test } from "vitest";

import { extractReleaseNotes } from "../scripts/extract-release-notes.mjs";

describe("release notes", () => {
  test("extracts the exact bilingual section for a v-prefixed tag", () => {
    const changelog = `# Changelog

## 1.2.0 - 2026-09-25

### Added

- New feature.

### 新增

- 新功能。

## 1.1.0 - 2026-09-20

- Previous release.
`;

    expect(extractReleaseNotes(changelog, "v1.2.0")).toBe(`### Added

- New feature.

### 新增

- 新功能。
`);
  });

  test("extracts the final section through the end of the changelog", () => {
    const changelog = `# Changelog

## 1.0.0 - 2026-09-01

- First release.
`;

    expect(extractReleaseNotes(changelog, "1.0.0")).toBe("- First release.\n");
  });

  test("matches the requested version exactly", () => {
    const changelog = `## 1.2.0-beta - 2026-09-24

- Beta release.
`;

    expect(() => extractReleaseNotes(changelog, "v1.2.0")).toThrow(
      "CHANGELOG.md does not contain a 1.2.0 release section"
    );
  });

  test("rejects a missing or empty release section", () => {
    expect(() => extractReleaseNotes("# Changelog\n", "v2.0.0")).toThrow(
      "CHANGELOG.md does not contain a 2.0.0 release section"
    );
    expect(() => extractReleaseNotes(
      "## 2.0.0 - 2026-09-25\n\n## 1.0.0 - 2026-09-01\n\n- Old.\n",
      "v2.0.0"
    )).toThrow("CHANGELOG.md contains an empty 2.0.0 release section");
  });
});
