# Development and publishing

[简体中文](development.md) | English

[Back to README](../README.en.md)

## Build and install locally

Source builds use the locked, published SDK: run `pnpm install --frozen-lockfile --ignore-scripts` and `pnpm build`, then install and register with `npx @mearl/setup@latest provider install '@mearl/provider-ego@/absolute/path/to/provider-ego'`. The SDK is bundled into the Provider, so a built package needs no additional Native Host process. To test an unpublished SDK, pack Native Host as a tgz and override with `MEARL_EGO_NATIVE_HOST_PACKAGE=/absolute/path/to/native-host.tgz pnpm build`; remove `.cache/native-host` to return to the locked SDK.

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
