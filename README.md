# Ego Lite Provider

[简体中文](README.md) | [English](README.en.md)

让 Mearl 会话绑定独立 Ego Space。Space 生命周期由 Ego 原生通道管理，已启用的 Mearl 扩展可执行匹配到同一 Space 的页面操作。

支持页面导航、快照、点击、输入、JavaScript、截图和文件上传，也支持设备与已安装 App 的环境模拟。使用 Mearl 的统一命令即可操作。

## 开始使用

需要 **Node.js ≥ 22.23.4**、支持 Provider 任务会话的 Mearl，并已完成 Ego Lite 引导安装，使 `ego-browser` 可用。已在 Ego Lite 0.6.2.9 验证；Windows 路径解析有单元测试，尚未完成真机验证，Linux 暂不在 Ego Lite 官方支持范围内。

安装 Provider，启动 Ego Lite，再用浏览器列表返回的 ID 创建会话。

```bash
npx @mearl/setup provider install @mearl/provider-ego
mearl browser_list
mearl session_manage --browser '<browserId>' --payload '{"operation":"new","providerOptions":{"name":"我的任务"}}'
```

保存返回的 `sessionId`。`session.task.pageTransport` 显示页面操作所用的通道。

```bash
mearl tab_open --session '<sessionId>' --payload '{"url":"https://example.com","reuse":"never"}'
mearl tab_list --session '<sessionId>'
mearl page_snapshot --session '<sessionId>' --payload '{"tabId":1}'
```

将示例中的 `tabId: 1` 换成实际返回的页面 ID。页面操作后，通过快照或页面状态核验结果。

已有任务可用 `providerOptions.spaceId` 重新关联，不与 `name` 同时传入；只能关联 Agent 所有的 Space。用 `mearl ego` 查看 Provider 指引，或用 `mearl session_manage --help` 核对参数。

## 交还与结束任务

交给用户操作时使用 `handoff`；用户明确交还控制权后，才使用 `resume`：

```bash
mearl session_manage --session '<sessionId>' --payload '{"operation":"handoff"}'
mearl session_manage --session '<sessionId>' --payload '{"operation":"resume"}'
```

完成任务后用 `end` 结束会话。默认关闭本次会话新建的页面，可以传入实际页面 ID 保留结果。

```bash
mearl session_manage --session '<sessionId>' --payload '{"operation":"end","keepTabIds":[1,2]}'
```

用户页面受 Ego 保护。需要把保留的页面恢复为普通页面时，在结束前显式清除模拟。

## 设备与 App 模拟

```bash
mearl set_device_emulation --session '<sessionId>' --payload '{"tabId":1,"enabled":true,"preset":"iphone-17-pro"}'
mearl get_capabilities --session '<sessionId>'
mearl set_app_profile --session '<sessionId>' --payload '{"tabId":1,"enabled":true,"profile":"<installed-app-id>"}'
```

设备与 App 分别设置和清除；App 配置来自本机已安装能力，设置或清除会刷新页面。支持设备外壳和根 WebView，真实授权仍需用户完成。请求和控制台采集能力以 `get_capabilities` 为准。

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
