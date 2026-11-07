# Plugins and the external toolchain

Two different things people call "plugin". Keep them apart.

## 1. DSH / Harness plugins

A Harness plugin is a **Cordis bundle** installed into the current profile with the
`plugin_manager` tool (`action: install_bundle`, `target` = absolute package directory). It is
profile-scoped: it changes every session in that profile and survives restarts. A bundle can
add a Host plugin, a Web UI panel, or just an MCP connection
(`transport: stdio|streamable-http`).

**Do you need one for iOS work? No.** Everything here is CLI-shaped: `xcodebuild`,
`simctl`, `xcodegen`. A plugin adds no capability that `scripts/*.sh` lacks.

**When a plugin pays off:**

| Want | Mechanism | Verdict |
| --- | --- | --- |
| Structured build/test results instead of parsing stdout | MCP server exposing `xcode_build`/`xcode_test` returning JSON | worth it at scale |
| A live simulator screen inside the Harness UI | Host plugin + client slot rendering `simctl` screenshots | nice, later |
| One command that installs these skills in every profile | a configuration-only bundle that ships the skill files | not recommended — see §3 |
| Human approval before installing to a physical device | permission policy, not a plugin | policy |

If you do build the MCP server, keep it a **thin wrapper over these same scripts** so the
agent and CI cannot diverge. Tool surface:

```
apple_preflight()                      -> {ready, missing[], fixes[]}
apple_generate(root)                   -> {targets[], schemes[]}
apple_build(scheme, destination)       -> {status, durationMs, firstError}
apple_test(scheme, destination, only)  -> {passed, failed, skipped, failures[]}
apple_xcresult(path)                   -> {tests, coverage, attachments[]}
apple_sim(action, destination)         -> {udid, state, screenshotPath?}
```

Rules for that server: never invent a destination (call `destinations.sh`), return the
**first** error line, cap log output at ~200 lines plus a path to the full log, and refuse to
run when `preflight` fails.

`plugin_manager` is approval-gated and is not exposed in every session; if it is missing, the
user installs the bundle from the Harness UI. Do not hand-edit the profile's `package.json`
or `cordis.patch.yml` — `install_bundle` owns those writes.

## 2. The external toolchain (this is what actually decides success)

| Tool | Required | Install | Why |
| --- | --- | --- | --- |
| Xcode (full app) | **yes** | App Store, or `xcodes install 26.0` | `xcodebuild`, `simctl`, iOS/watchOS SDKs, XCTest. Command Line Tools alone cannot build an app. |
| iOS simulator runtime | **yes** | `xcodebuild -downloadPlatform iOS` | UI tests need a booted simulator. |
| watchOS simulator runtime | for watch work | `xcodebuild -downloadPlatform watchOS` | watchUI tests need it. |
| xcodegen | **yes** | `brew install xcodegen` | deterministic project generation |
| xcbeautify | recommended | `brew install xcbeautify` | readable logs; JUnit report |
| swiftlint | recommended | `brew install swiftlint` | style gate, catches real bugs (force unwrap, retain cycles) |
| swiftformat | optional | `brew install swiftformat` | formatting; `--lint` in CI |
| xcodes | optional | `brew install xcodesorg/made/xcodes` | install/pin Xcode non-interactively |
| mise | optional | `brew install mise` | pin xcodegen/swiftlint per repo |
| xcparse | optional | `brew install xcparse` | rich attachment extraction |
| idb | optional | `brew tap facebook/fb && brew install idb-companion` | scripted taps beyond XCUITest |
| fastlane | optional | `brew install fastlane` | TestFlight/screenshots; not needed to build or test |

Versions: record Xcode in `.xcode-version` and tools in `mise.toml`. `preflight.sh` warns on
drift.

Machine state is not a plugin decision: **if `xcode-select -p` points at
`CommandLineTools`, nothing in the app/UI layer can run.** The `Core` Swift package layer
still runs, and `scripts/swift_test.sh` makes that work on a bare CLT install (framework
search path + `lib_TestingInterop` rpath + `--disable-sandbox`).

## 3. Do not ship these skills as a plugin bundle

A bundle that embeds `SKILL.md` files works, but it is the wrong tool here:

- Skills are plain files; copying them to `<workspace>/.dsh/skills/` (project-only) or
  `~/.dsh/skills/` (every workspace) is the supported, inspectable path.
- A bundle needs a version, an icon, locale files and an install approval for every update.
- Editing a skill as a file is instant; editing it as an installed bundle requires a rebuild
  and reinstall.

Use a bundle only if the skills must be distributed to other machines — then ship them
inside a configuration-only bundle whose patch adds nothing but the skill directory, and let
`install_bundle` place it.

## 4. Minimal viable set

For "generate with no errors, lots of tests, automated UI tests, minimal human steering":

1. Xcode + one iOS simulator runtime (human installs once; everything else is automated).
2. `xcodegen` (brew).
3. These skills.
4. Optional, in order of payoff: `xcbeautify` → `swiftlint` → the MCP wrapper → `swiftformat`.

Nothing else is required, and every extra dependency is a future red build.
