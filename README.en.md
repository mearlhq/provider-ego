# Ego Lite Provider

[简体中文](README.md) | [English](README.en.md)

Bind a Mearl session to an Ego Space. Ego's native channel manages the Space. An enabled Mearl extension can execute page actions when it matches the same Space.

Supports navigation, snapshots, clicks, typing, JavaScript, screenshots and uploads, plus device and installed App emulation through standard Mearl commands.

## Get started

Requires **Node.js ≥ 22.23.4**, Mearl with Provider task sessions, and completed Ego Lite onboarding with an available `ego-browser`. Validated with Ego Lite 0.6.2.9. Windows path resolution has unit tests but no real-device validation yet; Linux is not currently an officially supported Ego Lite platform.

Install the Provider, start Ego Lite, and use its browser ID to create a task session.

```bash
npx @mearl/setup provider install @mearl/provider-ego
mearl browser_list
mearl session_manage --browser '<browserId>' --payload '{"operation":"new","providerOptions":{"name":"My task"}}'
```

Save the returned `sessionId`. The `session.task.pageTransport` field shows the page execution route.

```bash
mearl tab_open --session '<sessionId>' --payload '{"url":"https://example.com","reuse":"never"}'
mearl tab_list --session '<sessionId>'
mearl page_snapshot --session '<sessionId>' --payload '{"tabId":1}'
```

Replace `tabId: 1` with the actual returned page ID. Verify action results through snapshots or page state.

Use `providerOptions.spaceId` instead of `name` to attach an existing Agent-owned Space. Run `mearl ego` for Provider guidance or `mearl session_manage --help` to check session parameters.

## Hand off and finish

Use `handoff` for user interaction. Call `resume` only after the user explicitly returns control:

```bash
mearl session_manage --session '<sessionId>' --payload '{"operation":"handoff"}'
mearl session_manage --session '<sessionId>' --payload '{"operation":"resume"}'
```

Use `end` to finish the session. Pages created by the session close by default. Pass their actual IDs to retain results.

```bash
mearl session_manage --session '<sessionId>' --payload '{"operation":"end","keepTabIds":[1,2]}'
```

Ego protects user pages. Clear emulation explicitly before ending if retained pages should return to ordinary browsing.

## Device and App emulation

```bash
mearl set_device_emulation --session '<sessionId>' --payload '{"tabId":1,"enabled":true,"preset":"iphone-17-pro"}'
mearl get_capabilities --session '<sessionId>'
mearl set_app_profile --session '<sessionId>' --payload '{"tabId":1,"enabled":true,"profile":"<installed-app-id>"}'
```

Set and clear device and App independently. App definitions come from locally installed capabilities; setting or clearing an App reloads the page. Device shells and root WebViews are supported. Real authorization requires user approval. Check `get_capabilities` for request and console capture support.

Connection loss and timeouts never replay operations automatically. Restart the Provider, reattach by Space ID, and verify page and emulation state first. See the [usage guide](https://github.com/mearlhq/provider-ego/blob/main/docs/usage.en.md) for platform paths, extension coexistence, emulation behavior and recovery limits.

## Development and publishing

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm test
pnpm build
```

Builds bundle the locked SDK; the resulting package needs no separate Native Host process. See the [development guide](https://github.com/mearlhq/provider-ego/blob/main/docs/development.en.md) for local installation, SDK overrides, real-browser validation and publishing.

Source is licensed under Apache-2.0.
