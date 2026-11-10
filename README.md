# Ego Lite Provider

[简体中文](README.md) | [English](README.en.md)

让 Mearl 通过 Ego Lite 的原生通道操作浏览器。每个任务使用一个独立 Space，无需浏览器扩展或额外的协作 Skill。

支持页面导航、快照、点击、输入、JavaScript、截图和文件上传，也支持设备与已安装 App 的环境模拟。使用 Mearl 的统一命令即可操作。

## 开始使用

需要 **Node.js ≥ 22.23.4**、**Mearl ≥ 3.0.7**，并已完成 Ego Lite 引导安装，使 `ego-browser` 可用。已在 Ego Lite 0.6.2.9 验证；Windows 路径解析有单元测试，尚未完成真机验证，Linux 暂不在 Ego Lite 官方支持范围内。

安装 Provider，并创建一个任务 Space：

```bash
npx @mearl/setup@latest provider install @mearl/provider-ego
mearl browser_launch --payload '{"provider":"ego","providerOptions":{"name":"我的任务"}}'
```

保存返回的完整 `browserId`。后续命令都使用它，不传 `--session`：

```bash
mearl tab_open --browser '<browserId>' --payload '{"url":"https://example.com","reuse":"never"}'
mearl tab_list --browser '<browserId>'
mearl page_snapshot --browser '<browserId>' --payload '{"tabId":1}'
```

将示例中的 `tabId: 1` 换成实际返回的页面 ID。页面操作后，通过快照或页面状态核验结果。

已有任务可用 `providerOptions.spaceId` 重新关联，不与 `name` 同时传入；只能关联 Agent 所有的 Space。用 `mearl ego` 查看 Provider 指引，或用 `mearl browser_launch --help` 核对启动参数。

## 交还与结束任务

交给用户操作时使用 `handoff`；用户明确交还控制权后，才使用 `resume`：

```bash
mearl browser_control --browser '<browserId>' --payload '{"operation":"handoff"}'
mearl browser_control --browser '<browserId>' --payload '{"operation":"resume"}'
```

完成任务后，用 `finish` 结束 Space。默认关闭 Agent 页面；需要留下结果页时，传入实际页面 ID：

```bash
mearl browser_control --browser '<browserId>' --payload '{"operation":"finish","keepTabIds":[1,2]}'
```

用户页面受 Ego 保护。`browser_release` 只解绑 Provider，不结束 Space，也不恢复模拟。保留页面的模拟依赖 Provider 连接，需要普通页面时应在结束前清除模拟。

## 设备与 App 模拟

```bash
mearl set_device_emulation --browser '<browserId>' --payload '{"tabId":1,"enabled":true,"preset":"iphone-17-pro"}'
mearl get_capabilities --browser '<browserId>'
mearl set_app_profile --browser '<browserId>' --payload '{"tabId":1,"enabled":true,"profile":"<installed-app-id>"}'
```

设备与 App 分别设置和清除；App 配置来自本机已安装能力，设置或清除会刷新页面。支持设备外壳和根 WebView，真实授权仍需用户完成。不提供扩展专属的请求与日志入口。

连接中断或超时不会自动重放操作；重启 Provider、按 Space ID 重新关联后，先核对页面和模拟状态。平台路径、扩展共存、模拟行为及恢复限制见[使用指南](https://github.com/mearlhq/provider-ego/blob/main/docs/usage.md)。

## 开发与发布

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm test
pnpm build
```

构建会打包锁定的 SDK，成品无需另起 Native Host 进程。本地安装、SDK 覆盖、真机验证和发布流程见[开发指南](https://github.com/mearlhq/provider-ego/blob/main/docs/development.md)。

源码采用 Apache-2.0 许可证。
