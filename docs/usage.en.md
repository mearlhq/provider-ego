# Ego Lite usage guide

[简体中文](usage.md) | English

[Back to README](../README.en.md)

## Install and run

Requires Node.js 22.23.4+, Mearl with Provider task sessions and an executable `ego-browser`.

The Provider looks for `ego-browser` on its PATH first. On macOS it also checks Ego's onboarding installation at `~/.local/bin/ego-browser`, without requiring changes to the desktop process PATH. If the command is missing, complete Ego Lite onboarding and submit the request again. Startup failures before the handshake do not permanently disable the Provider. Connection loss or request timeout after connection still requires restarting the Provider and verifying page state; operations are never replayed automatically.

On Windows, the Provider looks for native `ego-browser.exe` on PATH, then checks `%USERPROFILE%\.local\share\ego\active_version_dir\ego-browser.exe`, launching directly without a shell. This installation entry is supported by a [Windows usage report](https://github.com/openai/codex/issues/60444). Path resolution has unit test coverage; a real Windows end-to-end run is still pending. Linux is not yet an officially supported Ego Lite platform.

```bash
npx @mearl/setup provider install @mearl/provider-ego
mearl browser_list
mearl session_manage --browser '<browserId>' --payload '{"operation":"new","providerOptions":{"name":"My task"}}'
```

Use `mearl session_manage --help` to check the installed CLI. Pass `providerOptions.spaceId` to attach an existing Agent Space or `providerOptions.name` to name a new Space. Save the returned session ID and page IDs. After restarting the Provider, reattach by Space ID and verify page and environment state.

```bash
mearl tab_list --session '<sessionId>'
mearl tab_open --session '<sessionId>' --payload '{"url":"https://example.com","reuse":"never"}'
mearl page_snapshot --session '<sessionId>' --payload '{"tabId":1}'
mearl page_click --session '<sessionId>' --payload '{"tabId":1,"selector":"button"}'
```

The native page route supports listing, opening and closing pages, navigation, snapshots, clicks, typing, keys, scrolling, hovering, waits, JavaScript evaluation, frame-targeted operations, screenshots and uploads. Verify the business outcome with a snapshot or page state after dispatch.

## Handoff, resume and completion

Mearl discovers the running Ego Lite instance. A connected extension with Agent service enabled executes page actions when Mearl can match the same physical page. The native route manages the Space lifecycle. The ordinary extension browser entry remains available independently. Check `session.task.pageTransport` for the selected page route and `get_capabilities` for supported operations.

Use `mearl session_manage` with the session ID to hand off, resume or end the task.

```bash
mearl session_manage --session '<sessionId>' --payload '{"operation":"handoff"}'
# Only after the user explicitly returns control:
mearl session_manage --session '<sessionId>' --payload '{"operation":"resume"}'
mearl session_manage --session '<sessionId>' --payload '{"operation":"end","keepTabIds":[1,2]}'
```

`end` closes pages created by the session by default. List numeric IDs returned by `tab_list` in `keepTabIds` to retain results. The session stops dispatching new page actions during user takeover. Call `resume` only after the user explicitly returns control. Older hosts can use `browser_manage launch` and the returned task browser ID for native Space control.

## Device and App emulation

```bash
mearl set_device_emulation --session '<sessionId>' --payload '{"tabId":1,"enabled":true,"preset":"iphone-17-pro"}'
mearl get_capabilities --session '<sessionId>'
mearl set_app_profile --session '<sessionId>' --payload '{"tabId":1,"enabled":true,"profile":"<installed-app-id>"}'
```

Configure and clear device and App independently. Mearl's local host resolves installed App resources and verifies target identity and runtime integrity; business definitions are not bundled. Supports UA, viewport, DPR, touch properties, timezone, declarative globals and installed page JSBridge runtimes. A persistent Ego connection maintains emulation. App changes reload the page. Clearing App preserves explicit device settings; clearing device preserves App UA. Definitions stay pinned to the version resolved when configured; set again to update.

For emulation on the first request, open a blank page and configure it before `page_navigate`. The native page route also accepts `emulation` and `appProfile` on `tab_open`.

Set `deviceShell: true` in `set_device_emulation` or `set_app_profile.emulation` for the device shell and root WebView. The shared host handles container navigation, iframes, network controls, and installed App protocol, identity and authorization services. The page runtime displays authorization progress and pairing codes; the user must complete real approval. Handoff aborts the authorization lease and closes pending sessions. Resuming never revives or delivers results from old requests. Business services come from installed capabilities; the Provider never installs them automatically or simulates approval.

If `get_capabilities` lists `tab_checkpoint`, `get_requests`, and `get_logs`, take a checkpoint on the target tab and pass its `cursor` as `after` when querying. Use the same `--session` and `tabId` for each call. Take a new checkpoint after regaining control.

Retained pages still depend on the Provider connection for emulation and host services. Explicitly clear emulation before `end` when a normal page is wanted.

An interrupted environment mutation quarantines that page; only closing it remains available. Connection failures and timeouts are never automatically replayed. Inspect the outcome before choosing recovery. Cleanup excludes user Spaces and unrelated tasks.
