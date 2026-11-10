# Ego Lite Provider

[简体中文](README.md) | [English](README.en.md)

Control Ego Lite through Mearl's native browser integration. Each task uses its own Space, with no browser extension or additional cooperation Skill required.

Supports navigation, snapshots, clicks, typing, JavaScript, screenshots and uploads, plus device and installed App emulation through standard Mearl commands.

## Get started

Requires **Node.js ≥ 22.23.4**, **Mearl ≥ 3.0.7**, and completed Ego Lite onboarding with an available `ego-browser`. Validated with Ego Lite 0.6.2.9. Windows path resolution has unit tests but no real-device validation yet; Linux is not currently an officially supported Ego Lite platform.

Install the Provider and create a task Space:

```bash
npx @mearl/setup@latest provider install @mearl/provider-ego
mearl browser_launch --payload '{"provider":"ego","providerOptions":{"name":"My task"}}'
```

Save the full returned `browserId` and use it for subsequent commands. Do not pass `--session`:

```bash
mearl tab_open --browser '<browserId>' --payload '{"url":"https://example.com","reuse":"never"}'
mearl tab_list --browser '<browserId>'
mearl page_snapshot --browser '<browserId>' --payload '{"tabId":1}'
```

Replace `tabId: 1` with the actual returned page ID. Verify action results through snapshots or page state.

Use `providerOptions.spaceId` instead of `name` to attach an existing Agent-owned Space. Run `mearl ego` for Provider guidance or `mearl browser_launch --help` to check launch parameters.

## Hand off and finish

Use `handoff` for user interaction. Call `resume` only after the user explicitly returns control:

```bash
mearl browser_control --browser '<browserId>' --payload '{"operation":"handoff"}'
mearl browser_control --browser '<browserId>' --payload '{"operation":"resume"}'
```

Use `finish` to end the task Space. Agent pages close by default; pass actual page IDs to retain results:

```bash
mearl browser_control --browser '<browserId>' --payload '{"operation":"finish","keepTabIds":[1,2]}'
```

Ego protects user pages. `browser_release` only detaches the Provider; it neither ends the Space nor restores emulation. Retained pages depend on the Provider connection for emulation, so clear it before finishing if ordinary pages are wanted.

## Device and App emulation

```bash
mearl set_device_emulation --browser '<browserId>' --payload '{"tabId":1,"enabled":true,"preset":"iphone-17-pro"}'
mearl get_capabilities --browser '<browserId>'
mearl set_app_profile --browser '<browserId>' --payload '{"tabId":1,"enabled":true,"profile":"<installed-app-id>"}'
```

Set and clear device and App independently. App definitions come from locally installed capabilities; setting or clearing an App reloads the page. Device shells and root WebViews are supported. Real authorization requires user approval. Extension-specific request and log entry points are unavailable.

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
