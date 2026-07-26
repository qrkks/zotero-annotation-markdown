# 开发与发布

[English](../en/development.md)

## 本地开发

```powershell
pnpm install
pnpm test
pnpm run typecheck
pnpm run build
pnpm run package
```

打包后的插件位于：

```text
dist/zotero-annotation-markdown.xpi
```

通过 Zotero 插件管理器安装该文件，在真实阅读器中进行验证。

## 验证

发布前运行完整的本地验证流程：

```powershell
pnpm run verify
```

该命令会运行自动化测试和 TypeScript 检查、构建插件并打包 XPI。新增源码模块应使用 TypeScript，现有 JavaScript 模块可以逐步迁移。核心渲染、设置、DOM 适配、阅读器生命周期和打包流程已有自动化测试覆盖，但 Zotero 阅读器侧栏仍需在真实 Zotero 中检查。

## 发布检查清单

1. 更新 `package.json`、`pnpm-lock.yaml` 和 `addon/manifest.json` 中的版本号。
2. 更新 `CHANGELOG.md`，并同步修改受影响文档的中英文版本。
3. 运行 `pnpm run verify`。
4. 创建名为 `v<version>` 的 GitHub Release，并上传 `dist/zotero-annotation-markdown.xpi`。
5. 提交并推送生成的 `updates.json`，使 Zotero 能够发现新版本。

插件更新清单发布于：

```text
https://raw.githubusercontent.com/qrkks/zotero-annotation-markdown/main/updates.json
```

更完整的发布和插件市场流程应使用仓库的 Zotero 插件发布工作流。
