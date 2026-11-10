# Ego Lite Provider

[简体中文](README.md) | [English](README.en.md)

Independent `@mearl/provider-ego` controls one task Space through Ego's native Node/CDP channel. No browser extension or cooperation Skill is required. If the extension is installed, its Agent service can stay disabled while its manual debugging panels remain available.

## Install and run

Requires Node.js 22.23.4+, Mearl 3.0.7+ and `ego-browser` on PATH. Validated with Ego Lite 0.6.2.9.

```bash
npx @mearl/setup@latest provider install @mearl/provider-ego
mearl browser_launch --payload '{"provider":"ego","providerOptions":{"name":"My task"}}'
```

Check `mearl browser_launch --help` for the installed CLI's parameters; `mearl ego` shows Provider guidance. Use `providerOptions.spaceId` to attach an existing Agent Space, without `name`. User-owned Spaces are never claimed implicitly. Reuse the returned full browserId and tabId; do not pass `--session`. After restarting the Provider, attach by Space ID and verify page/environment state.

```bash
mearl tab_list --browser '<browserId>'
mearl tab_open --browser '<browserId>' --payload '{"url":"https://example.com","reuse":"never"}'
mearl page_snapshot --browser '<browserId>' --payload '{"tabId":1}'
mearl page_click --browser '<browserId>' --payload '{"tabId":1,"selector":"button"}'
```

Source builds use the locked, published SDK: run `pnpm install --frozen-lockfile --ignore-scripts` and `pnpm build`, then install and register with `npx @mearl/setup@latest provider install '@mearl/provider-ego@/absolute/path/to/provider-ego'`. The SDK is bundled into the Provider, so a built package needs no additional Native Host process. To test an unpublished SDK, pack Native Host as a tgz and override with `MEARL_EGO_NATIVE_HOST_PACKAGE=/absolute/path/to/native-host.tgz pnpm build`; remove `.cache/native-host` to return to the locked SDK.

Supports listing/opening/closing pages, navigation, snapshots, clicks, typing, keys, scrolling, hovering, waits, JavaScript evaluation, frame-targeted operations, native screenshots and uploads. The shared native page host owns page operations and snapshot refs. A dispatch receipt does not verify the business outcome; inspect a snapshot or page state.

## Handoff, resume and completion

This package declares EgoLite's macOS Bundle ID. Extensions and Native Hosts supporting the coordination protocol default that profile's extension Agent access to disabled; users can explicitly change it in extension settings. Update core and extension and register this package again to activate the declaration. The policy never syncs to other browsers or disappears because the Provider goes offline. Idle pages do not poll control ownership. Checks run only while host requests are pending and stop when those requests finish. Ego still enforces control on every native page operation.

Use `mearl browser_control` with the full `browserId` returned at launch. Do not pass `--session`; no separate Ego command is required.

```bash
mearl browser_control --browser '<browserId>' --payload '{"operation":"handoff"}'
# Only after the user explicitly returns control:
mearl browser_control --browser '<browserId>' --payload '{"operation":"resume"}'
mearl browser_control --browser '<browserId>' --payload '{"operation":"finish","keepTabIds":[1,2]}'
```

`finish` keeps no Agent pages by default; Ego protects user pages. List numeric IDs returned by `tab_list` in `keepTabIds` to retain results. `browser_release` only detaches the Provider; it neither finishes the Space nor restores emulation. Use `browser_control` with `finish` for task completion. Ego's native control checks govern all page commands during user takeover, with no extension bypass. Never call `resume` to reclaim control automatically.

## Device and App emulation

```bash
mearl set_device_emulation --browser '<browserId>' --payload '{"tabId":1,"enabled":true,"preset":"iphone-17-pro"}'
mearl get_capabilities --browser '<browserId>'
mearl set_app_profile --browser '<browserId>' --payload '{"tabId":1,"enabled":true,"profile":"<installed-app-id>"}'
```

Configure and clear device and App independently. Mearl's local host resolves installed App resources and verifies target identity and runtime integrity; business definitions are not bundled. Supports UA, viewport, DPR, touch properties, timezone, declarative globals and installed page JSBridge runtimes. A persistent Ego connection maintains emulation. App changes reload the page. Clearing App preserves explicit device settings; clearing device preserves App UA. Definitions stay pinned to the version resolved when configured; set again to update.

Clicks, navigation and screenshots reuse the native page host, including device and WebView coordinate offsets. For emulation on the first request, pass `emulation` and `appProfile` to `tab_open`, or configure a blank page before `page_navigate`.

Set `deviceShell: true` in `set_device_emulation` or `set_app_profile.emulation` for the device shell and root WebView. The shared host handles container navigation, iframes, network controls, and installed App protocol, identity and authorization services. The page runtime displays authorization progress and pairing codes; the user must complete real approval. Handoff aborts the authorization lease and closes pending sessions. Resuming never revives or delivers results from old requests. Business services come from installed capabilities; the Provider never installs them automatically or simulates approval.

Extension-specific request/log entry points are not provided. Retained pages still depend on the Provider connection for emulation and host services; explicitly clear emulation before `finish` when a normal page is wanted.

An interrupted environment mutation quarantines that page; only closing it remains available. Connection failures and timeouts are never automatically replayed. Inspect the outcome before choosing recovery. Cleanup excludes user Spaces and unrelated tasks.

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
MEARL_EGO_TEST_APP=example-app \
MEARL_EGO_TEST_RUNTIME='typeof ExampleBridge === "object"' \
MEARL_EGO_TEST_UA='ExampleApp/' node scripts/live-smoke.mjs
```

The real-browser test requires an installed App capability. Replace the example environment variables with its ID, a boolean expression detecting its page bridge, and a UA substring. The expression must return false after clearing the App. The script creates a dedicated Space and checks input, clicks, handoff blocking, resume, the device shell, root WebView navigation, restoration and completion. It closes the Space on success and retains it for diagnosis on failure. Screenshot: `/tmp/mearl-ego-provider-smoke.png`. Regression tests cover authorization controller integration and cancellation; the script does not initiate real pairing.

## Publishing

Commit the version, lockfile and bilingual `changelogs/v<version>` files, then run **Publish** in GitHub Actions on `main`. The workflow builds, tests and stores the package before publishing to npm and GitHub Releases using npm trusted publishing (OIDC). The `npm` environment permits only `main`, with no long-lived npm token. Disable the `publish` option to validate and produce an artifact only.

After a publication failure, rerun only the failed publish job to reuse the verified artifact. An existing npm version is skipped only when its integrity matches; existing GitHub assets are verified, never overwritten. Stop and inspect the state if artifacts expire or contents conflict.
