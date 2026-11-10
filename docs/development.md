# 开发与发布

简体中文 | [English](development.en.md)

[返回 README](../README.md)

## 本地构建与安装

源码构建使用锁定的已发布 SDK：执行 `pnpm install --frozen-lockfile --ignore-scripts` 和 `pnpm build`，再用 `npx @mearl/setup@latest provider install '@mearl/provider-ego@/absolute/path/to/provider-ego'` 安装并注册。SDK 会打包进 Provider，安装成品无需另起 Native Host 进程。测试尚未发布的 SDK 时，可将 Native Host 打包为 tgz 并通过 `MEARL_EGO_NATIVE_HOST_PACKAGE=/absolute/path/to/native-host.tgz pnpm build` 覆盖；删除 `.cache/native-host` 后恢复使用锁定的 SDK。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
MEARL_EGO_TEST_APP=example-app \
MEARL_EGO_TEST_RUNTIME='typeof ExampleBridge === "object"' \
MEARL_EGO_TEST_UA='ExampleApp/' node scripts/live-smoke.mjs
```

真实浏览器测试需要本机已安装 App 能力。将示例环境变量替换为其 ID、用于判断页面桥是否存在的布尔表达式和 UA 特征子串；表达式应在清除 App 后返回 false。脚本创建专用 Space，验证输入、点击、接管阻断、交还、设备外壳、根 WebView 跨导航保持、清除与收尾。成功后关闭测试 Space；失败时保留该 Space 便于诊断。截图输出 `/tmp/mearl-ego-provider-smoke.png`。授权控制器的接入与取消由回归测试覆盖，脚本不会发起真实扫码授权。

## 发布

提交版本、锁文件与双语 `changelogs/v<version>` 后，在 `main` 运行 GitHub Actions 的 **Publish**。流程先构建、测试并保存安装包，再通过 npm 可信发布（OIDC）发布到 npm 和 GitHub Release；`npm` 环境仅允许 `main` 部署，无需长期 npm Token。取消 `publish` 选项可只验证并生成制品。

发布失败时只重跑失败的发布 job，复用已验证制品。同版本 npm 包须完整性一致才会跳过；已有 GitHub 附件只校验、不覆盖。制品过期或内容冲突时停止并核对状态。
