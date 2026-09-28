import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function extractReleaseNotes(changelog, releaseTag) {
  const version = String(releaseTag ?? "").replace(/^v/, "");

  if (!version) {
    throw new Error("Release tag or version is required");
  }

  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(
    `^##[ \\t]+${escapedVersion}(?:[ \\t]+-[^\\r\\n]*)?[ \\t]*$`,
    "m"
  );
  const headingMatch = headingPattern.exec(changelog);

  if (!headingMatch) {
    throw new Error(`CHANGELOG.md does not contain a ${version} release section`);
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const remainingChangelog = changelog.slice(sectionStart);
  const nextHeadingMatch = /^##[ \\t]+/m.exec(remainingChangelog);
  const sectionEnd = nextHeadingMatch?.index ?? remainingChangelog.length;
  const notes = remainingChangelog.slice(0, sectionEnd).trim();

  if (!notes) {
    throw new Error(`CHANGELOG.md contains an empty ${version} release section`);
  }

  return `${notes}\n`;
}

export function createReleaseNotes(
  changelog,
  releaseTag,
  { previousTag, repository }
) {
  const notes = extractReleaseNotes(changelog, releaseTag).trimEnd();

  if (!previousTag || !repository) {
    throw new Error("Previous tag and repository are required");
  }

  return `${notes}\n\n` +
    `**Full Changelog**: https://github.com/${repository}/compare/${previousTag}...${releaseTag}\n`;
}

async function main() {
  const [releaseTag, changelogPath = "CHANGELOG.md", outputPath] =
    process.argv.slice(2);
  const changelog = await readFile(changelogPath, "utf8");
  const previousTag = execFileSync(
    "git",
    ["describe", "--tags", "--abbrev=0", `${releaseTag}^`],
    { encoding: "utf8" }
  ).trim();
  const repository = process.env.GITHUB_REPOSITORY ?? "qrkks/zotero-annotation-markdown";
  const notes = createReleaseNotes(changelog, releaseTag, {
    previousTag,
    repository
  });

  if (outputPath) {
    await writeFile(outputPath, notes, "utf8");
    console.log(`Release notes written to ${outputPath}`);
    return;
  }

  process.stdout.write(notes);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
