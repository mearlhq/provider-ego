# Ego Lite Provider

[简体中文](README.md) | [English](README.en.md)

独立的 `@mearl/provider-ego`，通过 Ego 原生 Node/CDP 通道控制一个任务 Space。无需浏览器扩展，也无需独立协作 Skill。已安装扩展时，可关闭其 Agent 服务，保留人工调试面板。

## 安装与运行

需要 Node.js 22.23.4+、Mearl 3.0.5+ 和可执行的 `ego-browser`。已在 Ego Lite 0.6.2.9 验证。当前包为本地开发版本，尚未发布到 npm。

```bash
pnpm install --frozen-lockfile --ignore-scripts
MEARL_EGO_NATIVE_HOST_PACKAGE=/absolute/path/to/native-host.tgz pnpm build
npx @mearl/setup provider install /absolute/path/to/provider-ego
mearl browser_launch --payload '{"provider":"ego","providerOptions":{"name":"我的任务"}}'
```

用 `mearl browser_launch --help` 核对当前 CLI 的启动参数；`mearl ego` 显示 Provider 指引。已有任务使用 `providerOptions.spaceId`，不能同时传 `name`。只关联 Agent 所有的 Space，不隐式认领用户 Space。任务始终复用返回的完整 `browserId` 和 `tabId`；不要传 `--session`。重启 Provider 后需按 Space ID 重新关联并核对页面及模拟状态。

```bash
mearl tab_list --browser '<browserId>'
mearl tab_open --browser '<browserId>' --payload '{"url":"https://example.com","reuse":"never"}'
mearl page_snapshot --browser '<browserId>' --payload '{"tabId":1}'
mearl page_click --browser '<browserId>' --payload '{"tabId":1,"selector":"button"}'
```

源码构建需要包含 `@mearl/native-host/external-page-host` 导出的 SDK 包；当前 npm 3.0.5 尚无此接口。先在核心仓库构建 Native Host，再在该包目录执行 `pnpm pack --out /absolute/path/to/native-host.tgz`。构建时通过上方环境变量传入发布格式的归档，SDK 会打包进 Provider；安装成品无需此环境变量，也无需另起 Native Host 进程。

支持页面列表、打开、关闭、导航、快照、点击、输入、按键、滚动、悬停、等待、执行 JavaScript、frame 定向操作、原生截图和文件上传。页面操作和快照 ref 由共享原生页面宿主管理。成功回执仅表示派发完成，业务结果应通过快照或页面状态核验。

## 接管、交还与收尾

本包声明 EgoLite 的 macOS Bundle ID。支持协调协议的扩展和 Native Host 会默认关闭该浏览器配置的扩展 Agent 接入；用户仍可在扩展设置中明确切换。需更新核心和扩展并重新注册本包后生效。策略不会同步到其他浏览器，也不会因 Provider 离线自动撤销。空闲页面不进行控制权轮询；仅有待完成的宿主请求时启用检查，结束后停止。每次原生页面操作仍受 Ego 的控制权校验约束。

源码安装可通过本包 CLI 操作；发布后也可使用包内 `mearl-ego` 可执行入口。这是命令，不是 Skill。

```bash
node /absolute/path/to/provider-ego/dist/cli.js handoff <spaceId>
# 用户明确交还后才执行：
node /absolute/path/to/provider-ego/dist/cli.js resume <spaceId>
node /absolute/path/to/provider-ego/dist/cli.js finish <spaceId> --keep p1,p2
```

`finish` 默认不保留 Agent 页面；用户页面仍受 Ego 保护。保留结果页时明确列出 Ego Page label。`browser_release` 只解绑 Provider，不结束 Space、不恢复模拟；结束任务使用 `finish`。用户接管时所有页面命令都受 Ego 原生控制检查约束，不走扩展旁路。任务控制 CLI 不用于自动抢回控制权。

## 设备与 App 模拟

```bash
mearl set_device_emulation --browser '<browserId>' --payload '{"tabId":1,"enabled":true,"preset":"iphone-17-pro"}'
mearl get_capabilities --browser '<browserId>'
mearl set_app_profile --browser '<browserId>' --payload '{"tabId":1,"enabled":true,"profile":"<installed-app-id>"}'
```

设备、App 分别设置，也分别清除。App 资源由本机 Mearl 宿主解析，校验页面身份及运行时代码完整性；业务定义不打包进 Provider。支持 UA、视口、DPR、触摸属性、时区、声明式全局变量和已安装页面 JSBridge 运行时。模拟通过持久 Ego 连接维持；App 设置和清除会刷新页面。清除 App 保留显式设备配置，清除设备保留 App UA。App 定义固定为设置时取得的版本，再次设置才能更新。

点击、导航和截图复用原生页面宿主，坐标按设备和 WebView 偏移处理。需要首次请求即带模拟参数时，在 `tab_open` 中传入 `emulation` 和 `appProfile`，或在空白页配置后再 `page_navigate`。

通过 `set_device_emulation` 或 `set_app_profile.emulation` 设置 `deviceShell: true`，启用设备外壳与根 WebView。共享宿主负责容器导航、iframe、网络控制和已安装 App 的协议请求、身份与授权桥。授权进度和二维码交给页面运行时展示，真实批准仍需用户完成。接管会中止授权租约并关闭待授权会话；交还后旧请求不会恢复或回传结果。业务能力按本机已安装声明提供，不自动安装，也不模拟真实批准。

不提供扩展专属请求/日志入口。被保留页面的模拟和宿主服务仍依赖 Provider 连接；需要普通页面时，在 `finish` 前显式清除模拟。

模拟变更中断时隔离该页，拒绝继续操作，允许关闭该任务页。连接中断和超时不会自动重放请求；先核对效果，再决定恢复方式。用户 Space 与其他任务页面不参与清理。

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
