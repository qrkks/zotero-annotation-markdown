import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const svgSampleGuidePath = path.join(root, "docs/examples/svg-samples.md");
export const rawSvgSampleGuidePath = path.join(root, "docs/examples/svg-raw-samples.md");

async function loadSvgSamples() {
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
  return { samples, cases };
}

export async function buildSvgSampleGuide() {
  const { samples, cases } = await loadSvgSamples();
  let markdown = `# SVG samples / SVG 测试样例

The first five samples come from [issue #3](https://github.com/qrkks/zotero-annotation-markdown/issues/3#issuecomment-6082324605); the sixth is the Chinese Jordan diagram used during development. SVG source is copied unchanged from the regression fixtures.

前五个样例来自 [issue #3](https://github.com/qrkks/zotero-annotation-markdown/issues/3#issuecomment-6082324605)，第六个是开发中使用的中文 Jordan 图示。SVG 源码直接取自回归样例，保持原样。

## How to test / 如何测试

Install [v0.13.0 or newer](https://github.com/qrkks/zotero-annotation-markdown/releases/tag/v0.13.0). Enable **Render SVG diagrams (Experimental)** and sidebar Markdown rendering. Before v0.14.2, the SVG option was named **Render SVG code blocks (Experimental)**. For page popups, also enable **Render page annotation popups as Markdown**. SVG is off by default; releases through 0.12.3 do not include this feature.

安装 [v0.13.0 或更新版本](https://github.com/qrkks/zotero-annotation-markdown/releases/tag/v0.13.0)，开启 **渲染 SVG 图示（实验性）** 和侧栏 Markdown 渲染。v0.14.2 之前，该 SVG 选项名为 **Render SVG code blocks (Experimental)** / **渲染 SVG 代码块（实验性）**。测试页内弹窗时，再开启 **将页面批注弹窗渲染为 Markdown**。SVG 默认关闭；0.12.3 及更早的版本不包含此功能。

Open any PDF and create a note annotation. Copy **one complete Markdown block below** with its copy button, paste it into the annotation comment as plain text, then click elsewhere or press Escape to save. Each copy block includes the inner SVG fence; copying only the SVG source omits that fence. Samples 4 and 6 deliberately leave its language blank. The outer four-backtick fence belongs to this guide and is not part of the copied annotation.

打开任意 PDF，创建一条便签批注。使用下面某个代码块的复制按钮，复制**完整 Markdown 内容**，以纯文本粘贴到批注评论中，失焦或按 Escape 保存。每个复制块都包含 SVG 的内层代码围栏；只复制 SVG 源码会漏掉围栏。样例 4 和 6 特意不指定语言。外层四个反引号用于本页展示，不属于复制后的批注内容。

v0.14.2 also supports complete SVG on its own lines without code fences or blank separators. Use the [six raw SVG samples](svg-raw-samples.md) to test that input format; the fenced samples below remain supported.

v0.14.2 也支持独立占一行或多行的完整裸 SVG，不必添加代码围栏或空行。可用[六个裸 SVG 样例](svg-raw-samples.md)测试这种输入方式；下方的围栏样例仍然受支持。

Check the expected image, opening the viewer by clicking the SVG image or **View larger**, Escape returning to the selected annotation, source editing and saving from text or blank preview space outside the image, Reader reopening, and Zotero restarting. Direct image clicks require v0.14.1 or newer; older versions use **View larger**. Turning SVG off should reveal the original code without changing stored source. Report your Zotero/plugin versions, sample number, sidebar or popup, and reproduction steps if something fails.

检查预期图片、点击 SVG 图片或 **View larger** 打开查看器、Escape 关闭后保留批注选择、从图片外的文字或预览空白区域编辑保存、Reader 重开和 Zotero 重启。直接点击图片需要 v0.14.1 或更新版本；旧版本请使用 **View larger**。关闭 SVG 后应显示原始代码，保存的源码不应变化。反馈问题时请提供 Zotero/插件版本、样例编号、侧栏或弹窗，以及复现步骤。

v0.13.1 adds zoom and pan controls; v0.13.0 has the original scrollable viewer. In v0.13.1 or later, also check **− / +**, the current percentage, the single **Fit** reset button, wheel zoom, and drag panning beyond the Reader bounds. Fit should restore the original size when it fits, or shrink an oversized diagram to show it completely; there is no separate 100% button. The frame and image should grow or shrink together, while the controls retain their size. The frame should stop growing at the Reader edges, the underlying PDF should not scroll, and Tab/Shift+Tab should remain inside the viewer. Repeat in the sidebar and a page popup.

v0.13.1 新增缩放和平移；v0.13.0 使用原来的可滚动查看器。v0.13.1 及之后版本中，再检查 **− / +**、当前百分比、唯一的 **Fit** 恢复按钮、滚轮缩放，以及超过 Reader 边界后的拖动平移。Fit 应在图像放得下时恢复原始大小，放不下时缩小到完整显示；没有单独的 100% 按钮。图片和浮层应一起放大或缩小，按钮和文字大小不变；浮层达到 Reader 边界后停止扩大，底层 PDF 不应滚动，Tab/Shift+Tab 应保持在查看器内；侧栏和页内弹窗都应测试。

`;
  for (let index = 0; index < samples.length; index++) {
    const [title, expected, language] = cases[index];
    markdown += `## ${index + 1}. ${title}\n\nExpected / 预期：${expected}\n\n`;
    markdown += "````markdown\n" + `# SVG ${index + 1} — ${title}\n\n`;
    markdown += "```" + language + "\n" + samples[index] + "\n```\n````\n\n";
  }
  markdown += "## Verification record / 验证记录\n\nSee the [0.13.0 release validation](../test-evidence/2026-10-10-svg-release.md) and [initial compatibility results](../test-evidence/2026-10-10-svg-mvp.md) for the environment, results and package digests. / 环境、结果及安装包摘要见 [0.13.0 发版验证](../test-evidence/2026-10-10-svg-release.md)和[最初的兼容性验证](../test-evidence/2026-10-10-svg-mvp.md)。\n";
  markdown += "\nSee the [viewer zoom validation](../test-evidence/2026-10-11-svg-viewer-zoom.md) for the development build's automated and native-host checks. / 开发版的自动测试与真实宿主验证见[查看器缩放验证](../test-evidence/2026-10-11-svg-viewer-zoom.md)。\n";
  return markdown;
}

export async function buildRawSvgSampleGuide() {
  const { samples, cases } = await loadSvgSamples();
  let markdown = `# Raw SVG samples / 裸 SVG 测试样例

Requires [v0.14.2 or newer](https://github.com/qrkks/zotero-annotation-markdown/releases/tag/v0.14.2). Enable **Render SVG diagrams (Experimental)** and sidebar Markdown rendering. For page popups, also enable popup Markdown rendering. All six SVG documents are copied unchanged from the same fixtures as the [fenced samples](svg-samples.md).

需要 [v0.14.2 或更新版本](https://github.com/qrkks/zotero-annotation-markdown/releases/tag/v0.14.2)。开启 **渲染 SVG 图示（实验性）** 和侧栏 Markdown 渲染；测试页面弹窗时，也开启弹窗 Markdown 渲染。六份 SVG 源码直接取自[围栏样例](svg-samples.md)使用的回归文件，保持原样。

## How to test / 如何测试

Copy one complete block below with its copy button and paste it as plain text into a note annotation comment. Each copied block contains normal Markdown and a raw SVG, with no inner code fence and no blank separators. A complete SVG must occupy its own line or lines; blank lines before and after it are optional. A comment containing only a complete SVG is also supported. The outer code fence belongs to this guide and is not part of the copied annotation.

用下面某个代码块的复制按钮复制完整内容，以纯文本粘贴到便签批注评论。每个复制块包含普通 Markdown 与裸 SVG，不含内层代码围栏，也没有空行分隔。完整 SVG 独立占一行或多行即可，前后不必留空行；整条评论只有完整 SVG 也可以。外层代码围栏仅用于本页展示，不属于复制后的批注内容。

- Check the expected image in both the sidebar and page popup. Click the image or **View larger**, then check zoom, panning, Fit and closure.
- Edit and save from text outside the image. The stored source must still contain the original raw SVG, without inserted fences. Reopen the Reader to confirm it renders again.
- Turn SVG rendering off and on. The SVG should appear as literal code when off and as an image when on, while surrounding Markdown remains readable.
- Paste two complete SVGs on consecutive independent lines; both should render. SVG labels are literal text, while formulas in surrounding Markdown still render.
- Inline SVG, SVG inside list items or blockquotes, and HTML-wrapped SVG remain outside the supported scope. Explicit xml/html/text code fences continue to display source. Unsupported SVG falls back to code; incomplete fragments remain text.

- 在侧栏与页内弹窗中检查预期图像。点击图片或 **View larger**，检查缩放、平移、Fit 和关闭。
- 从图像外的文字进入编辑并保存。保存的内容须保留原始裸 SVG，不应插入围栏；重开 Reader 后应再次渲染。
- 关闭并重新开启 SVG 渲染。关闭时 SVG 显示为源码，开启时显示图片，周围 Markdown 仍可阅读。
- 在相邻的独立行上粘贴两份完整 SVG，两张都应渲染。SVG 标签中的文字按字面显示，外围 Markdown 中的公式仍可渲染。
- 暂不支持行内、列表、引用或 HTML 容器中的 SVG；明确标为 xml/html/text 的代码框继续显示源码。不支持的 SVG 回退为代码，不完整片段保留为文本。

`;
  for (let index = 0; index < samples.length; index++) {
    const [title, expected] = cases[index];
    const rawTitle = title.replace("Unlabeled fence and NBSP / 无语言围栏与 NBSP", "Copied NBSP / 复制产生的 NBSP");
    const rawExpected = expected.replace(" in an unlabeled fence", "").replace("无语言围栏中的", "");
    markdown += `## ${index + 1}. ${rawTitle}\n\nExpected / 预期：${rawExpected}\n\n`;
    markdown += "```markdown\n" + `# SVG ${index + 1} — ${rawTitle}\n` + samples[index].trimEnd();
    markdown += "\nNormal Markdown after the diagram. / 图示后面的普通 Markdown。\n```\n\n";
  }
  markdown += "## Verification record / 验证记录\n\nSee the [v0.14.2 raw SVG validation](../test-evidence/2026-10-11-raw-svg.md) for automated checks, native Zotero results and scope. / 自动检查、真实 Zotero 结果及适用范围见 [v0.14.2 裸 SVG 验证记录](../test-evidence/2026-10-11-raw-svg.md)。\n";
  return markdown;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [guidePath, build] of [[svgSampleGuidePath, buildSvgSampleGuide], [rawSvgSampleGuidePath, buildRawSvgSampleGuide]]) {
    const expected = await build();
    if (process.argv.includes("--check")) {
      if (await readFile(guidePath, "utf8") !== expected) {
        throw new Error("SVG sample guide is stale. Run node scripts/svg-samples.mjs.");
      }
    } else {
      await mkdir(path.dirname(guidePath), { recursive: true });
      await writeFile(guidePath, expected, "utf8");
    }
  }
  console.log(process.argv.includes("--check") ? "Both SVG sample guides match all six regression fixtures." : "Wrote fenced and raw SVG sample guides (six copyable annotations each).");
}
