# Ego Lite 使用指南

简体中文 | [English](usage.en.md)

[返回 README](../README.md)

## 安装与运行

需要 Node.js 22.23.4+、支持 Provider 任务会话的 Mearl 和可执行的 `ego-browser`。

Provider 优先从自身 PATH 查找 `ego-browser`，macOS 上也会检查 Ego 引导安装的 `~/.local/bin/ego-browser`，无需修改启动 Mearl 的桌面进程 PATH。找不到命令时会提示完成 Ego Lite 引导安装；安装完成后重新发起请求即可，握手前的启动失败不会使 Provider 永久失效。连接建立后的断线或请求超时仍须重启 Provider 并核对页面状态，不自动重放操作。

Windows 查找 PATH 中的原生 `ego-browser.exe`，再检查 `%USERPROFILE%\.local\share\ego\active_version_dir\ego-browser.exe`，直接启动而不经过 shell。该安装入口有[Windows 使用记录](https://github.com/openai/codex/issues/60444)；路径解析已覆盖单元测试，尚未完成 Windows 真机验证。Linux 尚不在 Ego Lite 官方支持的平台内。

```bash
npx @mearl/setup provider install @mearl/provider-ego
mearl browser_list
mearl session_manage --browser '<browserId>' --payload '{"operation":"new","providerOptions":{"name":"我的任务"}}'
```

用 `mearl session_manage --help` 核对当前 CLI 的参数。关联已有 Agent Space 时传 `providerOptions.spaceId`，创建新 Space 时可传 `providerOptions.name`。保存返回的 `sessionId` 和会话内页面的 `tabId`。Provider 重启后，可按 Space ID 重新关联并核对页面及模拟状态。

```bash
mearl tab_list --session '<sessionId>'
mearl tab_open --session '<sessionId>' --payload '{"url":"https://example.com","reuse":"never"}'
mearl page_snapshot --session '<sessionId>' --payload '{"tabId":1}'
mearl page_click --session '<sessionId>' --payload '{"tabId":1,"selector":"button"}'
```

原生页面通道支持页面列表、打开、关闭、导航、快照、点击、输入、按键、滚动、悬停、等待、执行 JavaScript、frame 定向操作、截图和文件上传。成功回执仅表示派发完成，业务结果应通过快照或页面状态核验。

## 接管、交还与收尾

Mearl 自动发现运行中的 Ego Lite 实例。创建会话时，已连接并启用 Agent 服务的扩展能匹配同一个物理页面，页面操作即优先走扩展。原生通道仍负责 Space 生命周期。扩展的普通浏览器入口仍可独立使用。会话选定的页面执行方式见 `session.task.pageTransport`，能力以 `get_capabilities` 为准。

用 `mearl session_manage` 和会话 ID 交接、恢复或结束。

```bash
mearl session_manage --session '<sessionId>' --payload '{"operation":"handoff"}'
# 用户明确交还后才执行：
mearl session_manage --session '<sessionId>' --payload '{"operation":"resume"}'
mearl session_manage --session '<sessionId>' --payload '{"operation":"end","keepTabIds":[1,2]}'
```

`end` 默认关闭本次会话新建的页面。保留结果时用 `keepTabIds` 列出 `tab_list` 返回的数字 ID。用户接管时，会话会停止派发新的页面操作。仅在用户明确交还控制权后调用 `resume`。旧版宿主可用 `browser_manage launch` 和返回的任务 `browserId` 操作原生 Space。

## 设备与 App 模拟

```bash
mearl set_device_emulation --session '<sessionId>' --payload '{"tabId":1,"enabled":true,"preset":"iphone-17-pro"}'
mearl get_capabilities --session '<sessionId>'
mearl set_app_profile --session '<sessionId>' --payload '{"tabId":1,"enabled":true,"profile":"<installed-app-id>"}'
```

设备、App 分别设置，也分别清除。App 资源由本机 Mearl 宿主解析，校验页面身份及运行时代码完整性；业务定义不打包进 Provider。支持 UA、视口、DPR、触摸属性、时区、声明式全局变量和已安装页面 JSBridge 运行时。模拟通过持久 Ego 连接维持；App 设置和清除会刷新页面。清除 App 保留显式设备配置，清除设备保留 App UA。App 定义固定为设置时取得的版本，再次设置才能更新。

需要首次请求即带模拟参数时，先打开空白页，配置后再用 `page_navigate`。原生页面通道也支持在 `tab_open` 中传入 `emulation` 和 `appProfile`。

通过 `set_device_emulation` 或 `set_app_profile.emulation` 设置 `deviceShell: true`，启用设备外壳与根 WebView。共享宿主负责容器导航、iframe、网络控制和已安装 App 的协议请求、身份与授权桥。授权进度和二维码交给页面运行时展示，真实批准仍需用户完成。接管会中止授权租约并关闭待授权会话；交还后旧请求不会恢复或回传结果。业务能力按本机已安装声明提供，不自动安装，也不模拟真实批准。

如果 `get_capabilities` 列出 `tab_checkpoint`、`get_requests` 和 `get_logs`，先为目标标签页获取 checkpoint，再把返回的 `cursor` 传给查询的 `after`。查询复用原来的 `--session` 和 `tabId`。控制权交还后重新获取 checkpoint。

被保留页面的模拟和宿主服务仍依赖 Provider 连接；需要普通页面时，在 `end` 前显式清除模拟。

模拟变更中断时隔离该页，拒绝继续操作，允许关闭该任务页。连接中断和超时不会自动重放请求；先核对效果，再决定恢复方式。用户 Space 与其他任务页面不参与清理。
