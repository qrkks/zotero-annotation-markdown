# SVG samples / SVG 测试样例

The first five samples come from [issue #3](https://github.com/qrkks/zotero-annotation-markdown/issues/3#issuecomment-6082324605); the sixth is the Chinese Jordan diagram used during development. SVG source is copied unchanged from the regression fixtures.

前五个样例来自 [issue #3](https://github.com/qrkks/zotero-annotation-markdown/issues/3#issuecomment-6082324605)，第六个是开发中使用的中文 Jordan 图示。SVG 源码直接取自回归样例，保持原样。

## How to test / 如何测试

Use a test build with SVG support. Enable **Render SVG code blocks (Experimental)** and sidebar Markdown rendering. For page popups, also enable **Render page annotation popups as Markdown**. SVG is off by default; the released 0.12.3 package does not include this trial feature.

使用包含 SVG 功能的测试版，开启 **Render SVG code blocks (Experimental)** 和侧栏 Markdown 渲染。测试页内弹窗时，再开启 **Render page annotation popups as Markdown**。SVG 默认关闭；已发布的 0.12.3 安装包不包含此次试验功能。

Open any PDF and create a note annotation. Copy **one complete Markdown block below** with its copy button, paste it into the annotation comment as plain text, then click elsewhere or press Escape to save. Each copy block includes the inner SVG fence; copying only the SVG source omits that fence. Samples 4 and 6 deliberately leave its language blank. The outer four-backtick fence belongs to this guide and is not part of the copied annotation.

打开任意 PDF，创建一条便签批注。使用下面某个代码块的复制按钮，复制**完整 Markdown 内容**，以纯文本粘贴到批注评论中，失焦或按 Escape 保存。每个复制块都包含 SVG 的内层代码围栏；只复制 SVG 源码会漏掉围栏。样例 4 和 6 特意不指定语言。外层四个反引号用于本页展示，不属于复制后的批注内容。

Check the expected image, **View larger**, Escape returning to the selected annotation, source editing and saving, Reader reopening, and Zotero restarting. Turning SVG off should reveal the original code without changing stored source. Report your Zotero/plugin versions, sample number, sidebar or popup, and reproduction steps if something fails.

检查预期图片、**View larger**、Escape 关闭后保留批注选择、编辑保存、Reader 重开和 Zotero 重启。关闭 SVG 后应显示原始代码，保存的源码不应变化。反馈问题时请提供 Zotero/插件版本、样例编号、侧栏或弹窗，以及复现步骤。

## 1. Excalidraw paths / Excalidraw 路径

Expected / 预期：Three hand-drawn circles. / 三个手绘圆形。

````markdown
# SVG 1 — Excalidraw paths / Excalidraw 路径

```svg
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 103.10696064102251 45.0221604629491" width="103.10696064102251" height="45.0221604629491"><!-- svg-source:excalidraw --><metadata></metadata><defs><style class="style-fonts">
      </style></defs><rect x="0" y="0" width="103.10696064102251" height="45.0221604629491" fill="#ffffff"></rect><g stroke-linecap="round" transform="translate(10 14.729626822985836) rotate(0 7.953265269047165 7.953265269047165)"><path d="M1.61 2.73 C1.61 2.73, 1.61 2.73, 1.61 2.73 M1.61 2.73 C1.61 2.73, 1.61 2.73, 1.61 2.73 M0.5 7.06 C1.95 5.43, 3.17 3.13, 6.4 0.27 M0.5 7.06 C2.8 4.88, 4.5 2.28, 6.4 0.27 M0.7 9.88 C2.31 8.29, 4.55 6.08, 8.57 0.82 M0.7 9.88 C3.66 6.56, 6.3 3.26, 8.57 0.82 M1.55 11.95 C5.39 7.8, 9.56 3.1, 11.39 0.63 M1.55 11.95 C4.55 8.86, 6.73 5.91, 11.39 0.63 M3.06 13.26 C5.77 10.47, 8.44 6.68, 12.9 1.94 M3.06 13.26 C6 9.75, 8.82 6.2, 12.9 1.94 M4.57 14.57 C6.96 11.82, 10.18 8.57, 14.41 3.25 M4.57 14.57 C8.2 10.19, 12.48 5.93, 14.41 3.25 M6.73 15.13 C9.9 12.13, 12.39 9.09, 15.92 4.56 M6.73 15.13 C9.99 11.19, 13.73 7.39, 15.92 4.56 M8.9 15.69 C11.24 12.97, 13.31 11.08, 15.46 8.14 M8.9 15.69 C10.99 13.31, 13.37 10.4, 15.46 8.14" stroke="#fab005" stroke-width="0.25" fill="none"></path><path d="M6.11 -0.1 C7.56 -0.59, 9.74 -0.24, 11.25 0.54 C12.77 1.32, 14.52 2.87, 15.19 4.57 C15.86 6.28, 15.83 9.13, 15.28 10.77 C14.74 12.41, 13.33 13.62, 11.92 14.4 C10.5 15.18, 8.46 15.66, 6.78 15.45 C5.1 15.24, 2.91 14.35, 1.83 13.14 C0.75 11.94, 0.38 9.91, 0.32 8.21 C0.26 6.5, 0.41 4.29, 1.47 2.89 C2.53 1.49, 5.78 0.29, 6.66 -0.18 C7.55 -0.64, 6.75 0.02, 6.76 0.13 M8.45 -0.69 C10.27 -0.7, 12.68 0.57, 13.98 1.9 C15.28 3.23, 16.14 5.52, 16.25 7.3 C16.36 9.08, 15.7 11.16, 14.65 12.59 C13.59 14.01, 11.57 15.51, 9.91 15.84 C8.26 16.18, 6.16 15.22, 4.71 14.58 C3.26 13.94, 1.87 13.56, 1.21 12.01 C0.55 10.46, 0.44 6.92, 0.72 5.27 C1.01 3.62, 1.7 2.9, 2.92 2.12 C4.14 1.34, 7.17 0.87, 8.04 0.59 C8.9 0.32, 8.13 0.35, 8.13 0.46" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g><g stroke-linecap="round" transform="translate(40.16755791707533 14.729626822985836) rotate(0 7.953265269047165 7.953265269047165)"><path d="M1.53 2.66 C1.53 2.66, 1.53 2.66, 1.53 2.66 M1.53 2.66 C1.53 2.66, 1.53 2.66, 1.53 2.66 M-0.24 7.74 C2.47 4.57, 4.27 2.77, 6.98 -0.56 M-0.24 7.74 C2.51 4.29, 5.27 1.01, 6.98 -0.56 M0.62 9.81 C4.06 6.11, 6.68 2.94, 8.49 0.75 M0.62 9.81 C2.85 7.24, 4.66 5.25, 8.49 0.75 M1.47 11.88 C4.14 8.9, 7.79 5.85, 10.66 1.31 M1.47 11.88 C4.37 8.23, 7.27 4.99, 10.66 1.31 M2.98 13.19 C6.09 9.74, 8.52 6.04, 12.82 1.87 M2.98 13.19 C5.42 10.1, 8.22 7.19, 12.82 1.87 M4.49 14.5 C7.9 11.32, 9.86 7.66, 13.67 3.94 M4.49 14.5 C7.15 11.25, 9.68 8.47, 13.67 3.94 M6 15.81 C9.41 12.41, 12.41 8.76, 15.18 5.25 M6 15.81 C8.81 12.7, 11.39 9.63, 15.18 5.25 M8.82 15.62 C10.76 13.34, 12.78 11.27, 15.38 8.07 M8.82 15.62 C11.45 12.64, 13.93 9.88, 15.38 8.07" stroke="#fab005" stroke-width="0.25" fill="none"></path><path d="M6.7 -0.28 C8.31 -0.48, 10.48 0.68, 11.9 1.6 C13.32 2.51, 14.67 3.71, 15.22 5.2 C15.78 6.68, 15.86 8.92, 15.23 10.52 C14.61 12.13, 12.9 13.94, 11.47 14.8 C10.04 15.66, 8.3 16.02, 6.64 15.67 C4.98 15.32, 2.63 14.05, 1.51 12.67 C0.4 11.3, -0.06 9.11, -0.05 7.43 C-0.03 5.75, 0.43 3.88, 1.6 2.58 C2.76 1.29, 5.97 0.15, 6.95 -0.33 C7.92 -0.81, 7.45 -0.48, 7.46 -0.3 M6.46 0.37 C7.95 -0.03, 10.17 0.22, 11.6 0.99 C13.03 1.76, 14.37 3.57, 15.04 5 C15.7 6.43, 15.98 7.87, 15.61 9.56 C15.23 11.26, 14.12 14.25, 12.78 15.17 C11.44 16.1, 9.38 15.31, 7.56 15.13 C5.73 14.95, 3.16 15.08, 1.82 14.07 C0.48 13.05, -0.38 10.79, -0.49 9.03 C-0.6 7.28, 0.13 4.91, 1.14 3.52 C2.16 2.13, 4.68 1.3, 5.62 0.68 C6.55 0.06, 6.78 -0.16, 6.77 -0.21" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g><g stroke-linecap="round" transform="translate(70.33511583415066 14.729626822985836) rotate(0 7.953265269047165 7.953265269047165)"><path d="M1.66 2.76 C1.66 2.76, 1.66 2.76, 1.66 2.76 M1.66 2.76 C1.66 2.76, 1.66 2.76, 1.66 2.76 M-0.12 7.85 C1.78 5.76, 2.73 4.33, 6.45 0.3 M-0.12 7.85 C1.73 6.06, 3.31 4.39, 6.45 0.3 M0.74 9.92 C2.77 7.35, 4.84 5.1, 8.61 0.86 M0.74 9.92 C2.38 8.3, 3.8 6.15, 8.61 0.86 M1.59 11.98 C5.12 7.54, 8.88 3.88, 11.43 0.66 M1.59 11.98 C4.19 9.22, 6.26 6.24, 11.43 0.66 M2.44 14.05 C5.48 9.93, 8.44 6.14, 12.94 1.98 M2.44 14.05 C5.26 11.23, 7.8 8.03, 12.94 1.98 M4.61 14.61 C7.65 11.73, 10.92 7.59, 14.45 3.29 M4.61 14.61 C7.29 11.69, 9.93 8.92, 14.45 3.29 M6.12 15.92 C8.82 13.23, 11.76 9.83, 15.3 5.35 M6.12 15.92 C8.83 12.65, 12.11 9.54, 15.3 5.35 M8.94 15.72 C11.01 13.82, 11.98 12.08, 15.5 8.18 M8.94 15.72 C10.62 13.57, 12.78 11.45, 15.5 8.18" stroke="#fab005" stroke-width="0.25" fill="none"></path><path d="M6.24 -0.14 C7.84 -0.66, 10.29 -0.2, 11.78 0.66 C13.27 1.52, 14.5 3.37, 15.17 5.02 C15.83 6.67, 16.32 8.96, 15.76 10.56 C15.19 12.16, 13.31 13.79, 11.78 14.62 C10.25 15.44, 8.29 15.79, 6.57 15.52 C4.85 15.26, 2.58 14.35, 1.47 13.03 C0.35 11.72, -0.2 9.39, -0.11 7.62 C-0.03 5.85, 0.86 3.66, 1.98 2.39 C3.1 1.13, 5.85 0.34, 6.6 0.03 C7.35 -0.28, 6.48 0.36, 6.49 0.54 M8.13 0.25 C9.74 0.09, 12.02 0.27, 13.37 1.49 C14.73 2.7, 15.97 5.87, 16.26 7.55 C16.55 9.22, 16.18 10.09, 15.12 11.53 C14.07 12.96, 11.72 15.45, 9.93 16.17 C8.14 16.89, 5.95 16.58, 4.38 15.86 C2.8 15.14, 1.25 13.41, 0.48 11.88 C-0.29 10.34, -0.81 8.46, -0.26 6.66 C0.29 4.85, 2.48 2.25, 3.8 1.03 C5.11 -0.19, 6.81 -0.5, 7.64 -0.65 C8.46 -0.81, 8.58 -0.17, 8.76 0.09" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g><g stroke-linecap="round"><g transform="translate(10.85581958955163 34.23805113849943) rotate(0 7.601169493235744 -11.726970907024878)"><path d="M-0.42 -0.27 C2.23 -4.16, 12.93 -19.49, 15.62 -23.45 M0.37 0.78 C2.96 -3.25, 12.6 -20.19, 15.1 -24.24" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g><g transform="translate(10.85581958955163 34.23805113849943) rotate(0 7.601169493235744 -11.726970907024878)"><path d="M12.49 -10.2 C12.79 -13.87, 14.23 -17.18, 15.1 -24.24 M12.49 -10.2 C13 -14.18, 13.83 -17.64, 15.1 -24.24" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g><g transform="translate(10.85581958955163 34.23805113849943) rotate(0 7.601169493235744 -11.726970907024878)"><path d="M4.07 -15.16 C6.44 -17.58, 9.94 -19.67, 15.1 -24.24 M4.07 -15.16 C6.79 -17.84, 9.82 -20, 15.1 -24.24" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g></g><mask></mask><g stroke-linecap="round"><g transform="translate(56.91708804369546 32.310527306375945) rotate(0 -8.432432117522609 -9.511536770579141)"><path d="M-0.18 0.34 C-2.96 -2.84, -14.28 -16.11, -17.12 -19.37 M0.73 0.04 C-2.1 -3.04, -14.52 -15.66, -17.59 -18.77" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g><g transform="translate(56.91708804369546 32.310527306375945) rotate(0 -8.432432117522609 -9.511536770579141)"><path d="M-6.01 -13.26 C-8.19 -14.6, -11.43 -16, -17.59 -18.77 M-6.01 -13.26 C-9.4 -14.98, -12.96 -16.41, -17.59 -18.77" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g><g transform="translate(56.91708804369546 32.310527306375945) rotate(0 -8.432432117522609 -9.511536770579141)"><path d="M-12.27 -7.11 C-13.03 -9.82, -14.86 -12.6, -17.59 -18.77 M-12.27 -7.11 C-13.82 -10.59, -15.57 -13.8, -17.59 -18.77" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g></g><mask></mask><g stroke-linecap="round"><g transform="translate(64.59716435222026 23.061240251633933) rotate(0 13.866346268782848 -0.08728280253748721)"><path d="M-0.07 -0.21 C4.71 -0.27, 23.76 -0.01, 28.51 -0.06 M-0.78 -0.79 C3.93 -0.8, 23.18 0.5, 27.97 0.62" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g><g transform="translate(64.59716435222026 23.061240251633933) rotate(0 13.866346268782848 -0.08728280253748721)"><path d="M14.25 4.88 C17.63 3.46, 21.5 2.22, 27.97 0.62 M14.25 4.88 C16.93 4.08, 19.81 2.96, 27.97 0.62" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g><g transform="translate(64.59716435222026 23.061240251633933) rotate(0 13.866346268782848 -0.08728280253748721)"><path d="M14.72 -4.94 C18 -3.73, 21.74 -2.35, 27.97 0.62 M14.72 -4.94 C17.29 -3.62, 20.07 -2.63, 27.97 0.62" stroke="#1e1e1e" stroke-width="0.5" fill="none"></path></g></g><mask></mask></svg>
```
````

## 2. Embedded WOFF2 font / 内嵌 WOFF2 字体

Expected / 预期：Three curves, an arrow and degenerate in the embedded Cascadia font. / 三条曲线、箭头和使用内嵌 Cascadia 字体的 degenerate 文字。

````markdown
# SVG 2 — Embedded WOFF2 font / 内嵌 WOFF2 字体

```svg
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360.0000000000001 183.9663816327984" width="360.0000000000001" height="183.9663816327984"><!-- svg-source:excalidraw --><metadata></metadata><defs><style class="style-fonts">
      @font-face { font-family: Cascadia; src: url(data:font/woff2;base64,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); }</style></defs><rect x="0" y="0" width="360.0000000000001" height="183.9663816327984" fill="#ffffff"></rect><g transform="translate(10 50) rotate(0 58.59375 12)"><text x="0" y="18.93359375" font-family="Cascadia, monospace, Segoe UI Emoji" font-size="20px" fill="#1e1e1e" text-anchor="start" style="white-space: pre;" direction="ltr" dominant-baseline="alphabetic">degenerate</text></g><g stroke-linecap="round"><g transform="translate(148.6940431538706 159.24813649710813) rotate(0 8.836306448551056 -59.92299615346201)"><path d="M0 0 C1.13 -3.15, 5.34 1.09, 6.8 -18.88 C8.26 -38.86, 8.03 -119.82, 8.77 -119.85 C9.5 -119.87, 9.74 -38.98, 11.23 -19.06 C12.71 0.86, 16.6 -3.44, 17.67 -0.31 M0 0 C1.13 -3.15, 5.34 1.09, 6.8 -18.88 C8.26 -38.86, 8.03 -119.82, 8.77 -119.85 C9.5 -119.87, 9.74 -38.98, 11.23 -19.06 C12.71 0.86, 16.6 -3.44, 17.67 -0.31" stroke="#1e1e1e" stroke-width="2" fill="none"></path></g></g><mask></mask><g stroke-linecap="round"><g transform="translate(203.50439620216076 158.26810209805353) rotate(0 8.836306448551056 -59.92299615346201)"><path d="M0 0 C1.13 -3.15, 5.34 1.09, 6.8 -18.88 C8.26 -38.86, 8.03 -119.82, 8.77 -119.85 C9.5 -119.87, 9.74 -38.98, 11.23 -19.06 C12.71 0.86, 16.6 -3.44, 17.67 -0.31 M0 0 C1.13 -3.15, 5.34 1.09, 6.8 -18.88 C8.26 -38.86, 8.03 -119.82, 8.77 -119.85 C9.5 -119.87, 9.74 -38.98, 11.23 -19.06 C12.71 0.86, 16.6 -3.44, 17.67 -0.31" stroke="#1e1e1e" stroke-width="2" fill="none"></path></g></g><mask></mask><g stroke-linecap="round"><g transform="translate(10 158.57775061205894) rotate(0 158.17717114923954 0)"><path d="M0 0 C52.73 0, 263.63 0, 316.35 0 M0 0 C52.73 0, 263.63 0, 316.35 0" stroke="#1e1e1e" stroke-width="2" fill="none"></path></g><g transform="translate(10 158.57775061205894) rotate(0 158.17717114923954 0)"><path d="M292.86 8.55 C300.75 5.68, 308.64 2.81, 316.35 0 M292.86 8.55 C299.57 6.11, 306.28 3.67, 316.35 0" stroke="#1e1e1e" stroke-width="2" fill="none"></path></g><g transform="translate(10 158.57775061205894) rotate(0 158.17717114923954 0)"><path d="M292.86 -8.55 C300.75 -5.68, 308.64 -2.81, 316.35 0 M292.86 -8.55 C299.57 -6.11, 306.28 -3.67, 316.35 0" stroke="#1e1e1e" stroke-width="2" fill="none"></path></g></g><mask></mask><g stroke-linecap="round"><g transform="translate(157.77712625420537 158.57775061205894) rotate(0 0 -3.398146474288751)"><path d="M0 0 C0 -1.93, 0 -3.86, 0 -6.8 M0 0 C0 -2.71, 0 -5.42, 0 -6.8" stroke="#1e1e1e" stroke-width="2" fill="none"></path></g></g><mask></mask><g stroke-linecap="round"><g transform="translate(212.71357217603617 157.85984159252894) rotate(0 0 -3.398146474288751)"><path d="M0 0 C0 -1.86, 0 -3.72, 0 -6.8 M0 0 C0 -1.65, 0 -3.3, 0 -6.8" stroke="#1e1e1e" stroke-width="2" fill="none"></path></g></g><mask></mask><g stroke-linecap="round"><g stroke-opacity="0.4" fill-opacity="0.4" transform="translate(101.07400858703903 157.8915386033127) rotate(0 8.836306448551056 -59.92299615346201)"><path d="M0 0 C1.13 -3.15, 5.34 1.09, 6.8 -18.88 C8.26 -38.86, 8.03 -119.82, 8.77 -119.85 C9.5 -119.87, 9.74 -38.98, 11.23 -19.06 C12.71 0.86, 16.6 -3.44, 17.67 -0.31 M0 0 C1.13 -3.15, 5.34 1.09, 6.8 -18.88 C8.26 -38.86, 8.03 -119.82, 8.77 -119.85 C9.5 -119.87, 9.74 -38.98, 11.23 -19.06 C12.71 0.86, 16.6 -3.44, 17.67 -0.31" stroke="#1e1e1e" stroke-width="2" fill="none"></path></g></g><mask></mask></svg>
```
````

## 3. K4 and K3,3 / K4 与 K3,3

Expected / 预期：Two graphs with nodes, edges and labels. / 两幅带节点、连线和标签的图。

````markdown
# SVG 3 — K4 and K3,3 / K4 与 K3,3

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 300" width="700" style="max-width:100%">
<g fill="none" stroke="currentColor" stroke-width="2">
  <!-- K4 -->
  <path d="M150 30 L40 230 L260 230 Z"/>
  <path d="M150 30 L150 145 L40 230"/>
  <path d="M150 145 L260 230"/>
  <!-- K3,3 -->
  <path d="M410 30 L630 30 M410 30 L630 130 M410 30 L630 230"/>
  <path d="M410 130 L630 30 M410 130 L630 130 M410 130 L630 230"/>
  <path d="M410 230 L630 30 M410 230 L630 130 M410 230 L630 230"/>
</g>
<g fill="#fff" stroke="#222" stroke-width="2">
  <circle cx="150" cy="30" r="11"/>
  <circle cx="40" cy="230" r="11"/>
  <circle cx="260" cy="230" r="11"/>
  <circle cx="150" cy="145" r="11"/>
  <circle cx="410" cy="30" r="11"/>
  <circle cx="410" cy="130" r="11"/>
  <circle cx="410" cy="230" r="11"/>
  <circle cx="630" cy="30" r="11"/>
  <circle cx="630" cy="130" r="11"/>
  <circle cx="630" cy="230" r="11"/>
</g>
<g fill="currentColor" font-size="20" text-anchor="middle">
  <text x="150" y="275">K₄</text>
  <text x="520" y="275">K₃,₃</text>
</g>
</svg>
```
````

## 4. Unlabeled fence and NBSP / 无语言围栏与 NBSP

Expected / 预期：Three panels labeled t = 0, t = 0.25 and t = 0.5; copied non-breaking spaces remain in saved source. / 三个时间面板，保存的源码仍保留复制产生的不换行空格。

````markdown
# SVG 4 — Unlabeled fence and NBSP / 无语言围栏与 NBSP

```
<svg xmlns="http://www.w3.org/2000/svg"
     width="660" height="212" viewBox="0 0 660 212">
  <!-- Semi-transparent canvas background -->
  <rect x="0" y="0" width="660" height="212" rx="10"
        fill="#ffffff" fill-opacity="0.88"/>
  <!-- t = 0 -->
  <g transform="translate(14,0)">
    <text x="100" y="32" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="19"
          fill="#253340">t = 0</text>
    <rect x="37" y="54" width="126" height="126" rx="2"
          fill="#cde4df" fill-opacity="0.48"
          stroke="#627786" stroke-width="2.5"/>
    <line x1="37" y1="54" x2="163" y2="180"
          stroke="#596f7d" stroke-width="2.8"
          stroke-opacity="0.92" stroke-dasharray="8 6"/>
    <circle cx="37" cy="54" r="16" fill="#40a39b"/>
    <circle cx="163" cy="180" r="16" fill="#40a39b"/>
    <circle cx="163" cy="54" r="4.5" fill="#87949a"/>
    <circle cx="37" cy="180" r="4.5" fill="#87949a"/>
    <circle cx="100" cy="117" r="7.5"
            fill="#ef9c27" stroke="white" stroke-width="2.8"/>
  </g>
  <!-- t = 0.25 -->
  <g transform="translate(230,0)">
    <text x="100" y="32" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="19"
          fill="#253340">t = 0.25</text>
    <rect x="37" y="54" width="126" height="126" rx="2"
          fill="#cde4df" fill-opacity="0.48"
          stroke="#627786" stroke-width="2.5"/>
    <circle cx="37" cy="54" r="11.3" fill="#40a39b"/>
    <circle cx="163" cy="54" r="11.3" fill="#40a39b"/>
    <circle cx="37" cy="180" r="11.3" fill="#40a39b"/>
    <circle cx="163" cy="180" r="11.3" fill="#40a39b"/>
    <circle cx="100" cy="117" r="7.5"
            fill="#ef9c27" stroke="white" stroke-width="2.8"/>
  </g>
  <!-- t = 0.5 -->
  <g transform="translate(446,0)">
    <text x="100" y="32" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="19"
          fill="#253340">t = 0.5</text>
    <rect x="37" y="54" width="126" height="126" rx="2"
          fill="#cde4df" fill-opacity="0.48"
          stroke="#627786" stroke-width="2.5"/>
    <line x1="37" y1="180" x2="163" y2="54"
          stroke="#596f7d" stroke-width="2.8"
          stroke-opacity="0.92" stroke-dasharray="8 6"/>
    <circle cx="37" cy="180" r="16" fill="#40a39b"/>
    <circle cx="163" cy="54" r="16" fill="#40a39b"/>
    <circle cx="37" cy="54" r="4.5" fill="#87949a"/>
    <circle cx="163" cy="180" r="4.5" fill="#87949a"/>
    <circle cx="100" cy="117" r="7.5"
            fill="#ef9c27" stroke="white" stroke-width="2.8"/>
  </g></svg>
```
````

## 5. Gradients and compact paths / 渐变和紧凑路径

Expected / 预期：A pelican with shaded body, wing and pouch. / 鹈鹕及身体、翅膀和喉囊的渐变。

````markdown
# SVG 5 — Gradients and compact paths / 渐变和紧凑路径

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" fill="none">
  <title>pelican</title>
  <desc>pelican</desc>
  <defs>
    <linearGradient id="body" x1="280" y1="280" x2="490" y2="635" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fffef8"/><stop offset="1" stop-color="#dfe6e5"/>
    </linearGradient>
    <linearGradient id="pouch" x1="460" y1="245" x2="480" y2="394" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffd37b"/><stop offset="1" stop-color="#e99550"/>
    </linearGradient>
    <linearGradient id="wing" x1="264" y1="428" x2="411" y2="597" gradientUnits="userSpaceOnUse">
      <stop stop-color="#e6ecea"/><stop offset="1" stop-color="#a8b8bd"/>
    </linearGradient>
  </defs>
  <g stroke="#304650" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <!-- Far leg and webbed foot -->
    <path d="M391 591 390 661 420 683 367 683 348 675 370 662 367 594" fill="#d99652"/>
    <path d="m375 671 14 10m-3-17 18 18" stroke="#b37340" stroke-width="3"/>
    <!-- Tail -->
    <path d="M248 523 149 552 187 571 167 588 257 580 285 550" fill="#8499a4"/>
    <path d="m176 556 70-12m-48 24 51-13" stroke="#526b7a" stroke-width="3"/>
    <!-- Main silhouette: back, folded neck, head, breast -->
    <path d="M216 533
      C218 483 255 430 315 424
      C348 420 369 430 391 435
      C410 416 417 389 409 358
      C400 322 379 296 378 256
      C376 204 393 153 428 133
      L425 120 443 126 452 110 461 128
      C488 126 511 143 520 168
      C529 192 522 219 504 241
      C480 270 475 293 491 326
      C518 382 548 424 548 481
      C550 552 507 603 447 619
      C370 639 273 611 234 572
      C222 560 216 546 216 533Z" fill="url(#body)"/>
    <!-- Neck contour and soft breast shading -->
    <path d="M453 251 C435 291 448 324 466 358 C490 403 505 442 500 488 C496 522 480 546 457 562"
      stroke="#cad5d6" stroke-width="15"/>
    <path d="M410 173 C396 204 396 238 404 263" stroke="#fff" stroke-width="9"/>
    <!-- Sculpted folded wing -->
    <path d="M251 498 C274 449 332 442 377 462
      C417 480 438 522 456 568
      C416 594 359 593 313 573
      C285 561 263 539 251 522
      C247 514 247 507 251 498Z" fill="url(#wing)"/>
    <path d="M277 491 C316 477 357 492 391 528 C410 549 427 561 447 572
      M266 511 C298 511 335 540 367 565 C385 579 400 584 416 587
      M277 536 C301 542 320 560 338 577" stroke="#879ea8" stroke-width="4"/>
    <path d="M287 476 C312 467 337 470 357 480" stroke="#fffdf5" stroke-width="7"/>
    <!-- Foreleg and webbing -->
    <path d="M431 612 437 670 470 691
      Q474 696 465 697 L407 696 390 688
      416 671 409 617" fill="#efad60"/>
    <path d="m420 681 16 14m0-18 17 18m-38-21 22-3" stroke="#bb7a43" stroke-width="3"/>
    <!-- Large elastic throat pouch under the lower mandible -->
    <path d="M502 221 721 238
      C691 262 659 291 625 316
      C587 344 551 370 520 373
      C491 376 462 351 454 317
      C447 290 459 251 479 230Z" fill="url(#pouch)"/>
    <path d="M483 258 C466 300 485 342 515 350
      M505 267 C492 304 507 331 529 339
      M533 267 C528 296 537 314 549 325" stroke="#d18e50" stroke-width="3" opacity=".65"/>
    <!-- Upper bill: thin, long, with terminal hook -->
    <path d="M497 202
      C554 207 656 220 724 232
      Q741 235 744 244
      Q746 253 735 260
      L731 245
      C654 245 571 240 493 235
      Q482 220 497 202Z" fill="#f7be56"/>
    <path d="M512 215 711 236" stroke="#ffe4a1" stroke-width="5"/>
    <path d="m496 235 235 10" stroke="#ad733e" stroke-width="3"/>
    <path d="m524 215 13 2" stroke="#9a6a37" stroke-width="3"/>
    <!-- Eye patch and alert eye -->
    <path d="M467 182 C480 174 495 179 501 191 L494 205 470 202Z" fill="#e9b965" stroke="none"/>
    <circle cx="482" cy="190" r="11" fill="#fffdf3" stroke-width="3"/>
    <circle cx="485" cy="190" r="5.5" fill="#263d48" stroke="none"/>
    <circle cx="487" cy="187" r="1.8" fill="white" stroke="none"/>
    <path d="M465 171 Q477 164 489 170" stroke-width="3"/>
  </g>
</svg>
```
````

## 6. Chinese Jordan diagram / 中文 Jordan 图示

Expected / 预期：A square and transformed parallelogram with Chinese labels in an unlabeled fence. / 无语言围栏中的正方形、变换后的平行四边形和中文标签。

````markdown
# SVG 6 — Chinese Jordan diagram / 中文 Jordan 图示

```
<svg xmlns="http://www.w3.org/2000/svg"
     width="640" height="280" viewBox="0 0 640 280">
  <rect width="640" height="280" rx="12" fill="#f8fafc"/>

  <text x="160" y="35" font-size="18" text-anchor="middle"
        fill="#1e293b">原始正方形</text>
  <text x="475" y="35" font-size="18" text-anchor="middle"
        fill="#1e293b">Jordan 变换后</text>

  <!-- 坐标轴 -->
  <g stroke="#94a3b8" stroke-width="1.5">
    <path d="M55 202H280 M95 225V65"/>
    <path d="M355 202H605 M392 225V65"/>
  </g>

  <!-- 原始单位正方形 -->
  <polygon points="95,202 150,202 150,147 95,147"
           fill="#93c5fd" fill-opacity="0.45"
           stroke="#2563eb" stroke-width="2.5"/>

  <!-- J = [2,1;0,2] 变换后的平行四边形 -->
  <polygon points="392,202 502,202 557,92 447,92"
           fill="#fbbf24" fill-opacity="0.45"
           stroke="#d97706" stroke-width="2.5"/>

  <!-- 变换箭头 -->
  <path d="M285 151H345" stroke="#64748b"
        stroke-width="2.5" fill="none"/>
  <path d="M335 144L345 151L335 158"
        stroke="#64748b" stroke-width="2.5"
        fill="none"/>

  <!-- 顶点标记 -->
  <g fill="#2563eb">
    <circle cx="95" cy="202" r="4"/>
    <circle cx="150" cy="202" r="4"/>
    <circle cx="150" cy="147" r="4"/>
    <circle cx="95" cy="147" r="4"/>
  </g>
  <g fill="#d97706">
    <circle cx="392" cy="202" r="4"/>
    <circle cx="502" cy="202" r="4"/>
    <circle cx="557" cy="92" r="4"/>
    <circle cx="447" cy="92" r="4"/>
  </g>

  <g fill="#334155" font-size="15" text-anchor="middle">
    <text x="160" y="258">单位正方形</text>
    <text x="475" y="258">J = [2, 1; 0, 2]</text>
  </g>
</svg>

```
````

## Verification record / 验证记录

See the [saved SVG validation report](../test-evidence/2026-10-10-svg-mvp.md) for the environment, results and tested package digest. / 环境、结果及测试包摘要见[已保存的 SVG 验证报告](../test-evidence/2026-10-10-svg-mvp.md)。
