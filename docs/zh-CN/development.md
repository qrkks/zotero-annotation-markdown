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

该命令会运行自动化测试和 TypeScript 检查、构建插件并打包 XPI。`src/` 下的模块全部使用严格 TypeScript；`addon/` 中由 Zotero 直接执行的文件仍保留 JavaScript，`scripts/*.mjs` 则是 Node 工具。各模块所有权和运行边界参见[架构与文件职责](architecture.md)。核心渲染、设置、DOM 适配、阅读器生命周期和打包流程已有自动化测试覆盖，但 Zotero 阅读器侧栏仍需在真实 Zotero 中检查。

## 发布检查清单

1. 从干净检出或独立工作树开始，然后更新 `package.json`、`addon/manifest.json` 和 `tests/version.test.js` 中的版本号；依赖发生变化时同步更新 `pnpm-lock.yaml`。
2. 更新 `CHANGELOG.md`，并同步修改受影响文档的中英文版本。
3. 运行 `pnpm run verify`、`pnpm audit --prod`、`pnpm run release:verify v<version>` 和 `git diff --exit-code -- updates.json`。
4. 提交版本文件与生成的 `updates.json`，推送发布提交，并等待常规 CI 工作流通过。
5. 在该提交上创建带注释的 `v<version>` 标签并推送。标签触发的 `Release` 工作流会重新执行全部验证、创建 GitHub Release、上传 XPI，并核对线上资产摘要。

正常发布流程中不要手工运行 `gh release create`。可手工触发 dry-run，只验证当前检出内容而不发布：

```powershell
gh workflow run release.yml -f tag=v<version>
```

如果标签触发的工作流失败，标签会保留，但不会创建 GitHub Release。不要手工上传资产；应先在 `main` 修复原因，然后在确认不存在 Release 后删除失败且未发布的标签，或改用新的补丁版本。

插件更新清单发布于：

```text
https://raw.githubusercontent.com/qrkks/zotero-annotation-markdown/main/updates.json
```

更完整的插件市场流程应使用仓库的 Zotero 插件发布工作流。
