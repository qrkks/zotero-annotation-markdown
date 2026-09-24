import { readFile, writeFile } from "node:fs/promises";
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

async function main() {
  const [releaseTag, changelogPath = "CHANGELOG.md", outputPath] =
    process.argv.slice(2);
  const changelog = await readFile(changelogPath, "utf8");
  const notes = extractReleaseNotes(changelog, releaseTag);

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
