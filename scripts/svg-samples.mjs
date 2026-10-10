import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const svgSampleGuidePath = path.join(root, "docs/examples/svg-samples.md");

export async function buildSvgSampleGuide() {
  const originals = await readFile(path.join(root, "tests/fixtures/issue-3-svg-samples.md"), "utf8");
  const samples = [...originals.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(match => match[0]);
  if (samples.length !== 5) throw new Error("Expected the five original issue #3 SVG samples.");
  samples.push(await readFile(path.join(root, "tests/fixtures/jordan.svg"), "utf8"));
  const cases = [
    ["Excalidraw paths / Excalidraw 路径", "Three hand-drawn circles. / 三个手绘圆形。", "svg"],
    ["Embedded WOFF2 font / 内嵌 WOFF2 字体", "Three curves, an arrow and degenerate in the embedded Cascadia font. / 三条曲线、箭头和使用内嵌 Cascadia 字体的 degenerate 文字。", "svg"],
    ["K4 and K3,3 / K4 与 K3,3", "Two graphs with nodes, edges and labels. / 两幅带节点、连线和标签的图。", "svg"],
    ["Unlabeled fence and NBSP / 无语言围栏与 NBSP", "Three panels labeled t = 0, t = 0.25 and t = 0.5; copied non-breaking spaces remain in saved source. / 三个时间面板，保存的源码仍保留复制产生的不换行空格。", ""],
    ["Gradients and compact paths / 渐变和紧凑路径", "A pelican with shaded body, wing and pouch. / 鹈鹕及身体、翅膀和喉囊的渐变。", "svg"],
    ["Chinese Jordan diagram / 中文 Jordan 图示", "A square and transformed parallelogram with Chinese labels in an unlabeled fence. / 无语言围栏中的正方形、变换后的平行四边形和中文标签。", ""]
  ];
  let markdown = `# SVG samples / SVG 测试样例

The first five samples come from [issue #3](https://github.com/qrkks/zotero-annotation-markdown/issues/3#issuecomment-6082324605); the sixth is the Chinese Jordan diagram used during development. SVG source is copied unchanged from the regression fixtures.

前五个样例来自 [issue #3](https://github.com/qrkks/zotero-annotation-markdown/issues/3#issuecomment-6082324605)，第六个是开发中使用的中文 Jordan 图示。SVG 源码直接取自回归样例，保持原样。

## How to test / 如何测试

Install [v0.13.0 or newer](https://github.com/qrkks/zotero-annotation-markdown/releases/tag/v0.13.0). Enable **Render SVG code blocks (Experimental)** and sidebar Markdown rendering. For page popups, also enable **Render page annotation popups as Markdown**. SVG is off by default; releases through 0.12.3 do not include this feature.

安装 [v0.13.0 或更新版本](https://github.com/qrkks/zotero-annotation-markdown/releases/tag/v0.13.0)，开启 **Render SVG code blocks (Experimental)** 和侧栏 Markdown 渲染。测试页内弹窗时，再开启 **Render page annotation popups as Markdown**。SVG 默认关闭；0.12.3 及更早的版本不包含此功能。

Open any PDF and create a note annotation. Copy **one complete Markdown block below** with its copy button, paste it into the annotation comment as plain text, then click elsewhere or press Escape to save. Each copy block includes the inner SVG fence; copying only the SVG source omits that fence. Samples 4 and 6 deliberately leave its language blank. The outer four-backtick fence belongs to this guide and is not part of the copied annotation.

打开任意 PDF，创建一条便签批注。使用下面某个代码块的复制按钮，复制**完整 Markdown 内容**，以纯文本粘贴到批注评论中，失焦或按 Escape 保存。每个复制块都包含 SVG 的内层代码围栏；只复制 SVG 源码会漏掉围栏。样例 4 和 6 特意不指定语言。外层四个反引号用于本页展示，不属于复制后的批注内容。

Check the expected image, **View larger**, Escape returning to the selected annotation, source editing and saving, Reader reopening, and Zotero restarting. Turning SVG off should reveal the original code without changing stored source. Report your Zotero/plugin versions, sample number, sidebar or popup, and reproduction steps if something fails.

检查预期图片、**View larger**、Escape 关闭后保留批注选择、编辑保存、Reader 重开和 Zotero 重启。关闭 SVG 后应显示原始代码，保存的源码不应变化。反馈问题时请提供 Zotero/插件版本、样例编号、侧栏或弹窗，以及复现步骤。

`;
  for (let index = 0; index < samples.length; index++) {
    const [title, expected, language] = cases[index];
    markdown += `## ${index + 1}. ${title}\n\nExpected / 预期：${expected}\n\n`;
    markdown += "````markdown\n" + `# SVG ${index + 1} — ${title}\n\n`;
    markdown += "```" + language + "\n" + samples[index] + "\n```\n````\n\n";
  }
  markdown += "## Verification record / 验证记录\n\nSee the [0.13.0 release validation](../test-evidence/2026-10-10-svg-release.md) and [initial compatibility results](../test-evidence/2026-10-10-svg-mvp.md) for the environment, results and package digests. / 环境、结果及安装包摘要见 [0.13.0 发版验证](../test-evidence/2026-10-10-svg-release.md)和[最初的兼容性验证](../test-evidence/2026-10-10-svg-mvp.md)。\n";
  return markdown;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const expected = await buildSvgSampleGuide();
  if (process.argv.includes("--check")) {
    if (await readFile(svgSampleGuidePath, "utf8") !== expected) {
      throw new Error("SVG sample guide is stale. Run node scripts/svg-samples.mjs.");
    }
    console.log("SVG sample guide matches all six regression fixtures.");
  } else {
    await mkdir(path.dirname(svgSampleGuidePath), { recursive: true });
    await writeFile(svgSampleGuidePath, expected, "utf8");
    console.log("Wrote docs/examples/svg-samples.md (six copyable annotations).");
  }
}
