import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import MarkdownIt from "markdown-it";

export function extractReleaseNotes(changelog: string, releaseTag: string | undefined) {
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
  changelog: string,
  releaseTag: string,
  { previousTag, repository }: {previousTag?: string; repository?: string}
) {
  const notes = groupLanguages(extractReleaseNotes(changelog, releaseTag).trimEnd());

  if (!previousTag || !repository) {
    throw new Error("Previous tag and repository are required");
  }

  return `${notes}\n\n` +
    `**Full Changelog**: https://github.com/${repository}/compare/${previousTag}...${releaseTag}\n`;
}

function groupLanguages(notes: string): string {
  const lines = notes.split("\n");
  // Use parsed headings so examples inside code fences stay with their section.
  const headings = new MarkdownIt().parse(notes, {}).flatMap(token =>
    token.type === "heading_open" && token.tag === "h3" && token.map ? [token.map[0]] : []);
  const starts = [...new Set([0, ...headings]), lines.length];
  const english: string[] = [], chinese: string[] = [];
  for (let index = 0; index < starts.length - 1; index++) {
    const start = starts[index];
    const section = lines.slice(start, starts[index + 1]).join("\n").trim();
    if (!section) continue;
    const language = /^\s{0,3}###\s+.*\p{Script=Han}/u.test(lines[start]) ? chinese : english;
    language.push(section);
  }
  if (!english.length || !chinese.length) return notes;
  return `## English\n\n${english.join("\n\n")}\n\n## 简体中文\n\n${chinese.join("\n\n")}`;
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
