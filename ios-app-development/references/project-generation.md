# Project generation with XcodeGen

The `.xcodeproj` is a build artifact. `project.yml` is the source of truth and the only file
a human or agent edits. This removes the three classic failure modes: merge conflicts in
`project.pbxproj`, "target not in scheme", and settings that exist only on one machine.

## Why XcodeGen and not Tuist / raw Xcode

| Option | Use when | Cost |
| --- | --- | --- |
| **XcodeGen** (default) | any app up to ~30 targets | one Homebrew binary, no daemon, YAML |
| Tuist | many modules, cache-heavy builds, team-wide conventions | extra server/daemon, `tuist` version pinning, a second DSL |
| Hand-made `.xcodeproj` | never for new work | every change is a pbxproj edit; unreviewable |
| Swift package only | libraries, CLIs | cannot produce an installable `.app` |

Do not mix generators in one repo.

## Minimal spec that actually builds

`templates/project.yml` is the reference. The parts that matter:

```yaml
name: MyApp
options:
  bundleIdPrefix: com.example
  deploymentTarget: { iOS: "18.0" }
  createIntermediateGroups: true
packages:
  Core: { path: Core }
targets:
  MyApp:
    type: application
    platform: iOS
    sources: [App]
    dependencies:
      - package: Core
        product: Core
    info:
      path: Config/Info.plist          # generated, do not hand-edit
      properties:
        CFBundleDisplayName: MyApp
        UILaunchScreen: {}
        ITSAppUsesNonExemptEncryption: false
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.example.myapp
        GENERATE_INFOPLIST_FILE: "NO"
        TARGETED_DEVICE_FAMILY: "1"
```

Rules:

- `sources` takes **directories**. New files are picked up on regeneration; never list files
  one by one.
- `info.path` must live outside the app's `sources` directory, otherwise the plist risks
  being copied as a resource. `Config/` is the convention here.
- Settings belong in `settings.base`; per-config overrides in `settings.configs.debug/release`.
- Signing settings stay **out** of the project. The scripts pass
  `CODE_SIGNING_ALLOWED=NO` for simulator builds; device signing is a separate, human-owned
  step.
- `SWIFT_TREAT_WARNINGS_AS_ERRORS` stays `NO` in the project and is turned on per-run with
  `--strict`, so local iteration is not blocked by a new SDK warning.

## Targets you will add

| Target | type | platform | Notes |
| --- | --- | --- | --- |
| App | `application` | iOS | owns `Config/Info.plist`, embeds watch app if any |
| Unit tests | `bundle.unit-test` | iOS | dependency on the app → XcodeGen sets `TEST_HOST`/`BUNDLE_LOADER` |
| UI tests | `bundle.ui-testing` | iOS | dependency on the app → `TEST_TARGET_NAME` |
| Core | Swift package | iOS + watchOS + macOS | no UI imports; enables host tests |
| App clip / extension | `application.on-demand-install-capable` / `app-extension` | iOS | add `info.properties.NSExtension` explicitly |
| Watch app | `application` | watchOS | **not** a `supportedDestinations` entry — see the watch skill |

Add the test targets to the app scheme or they never run:

```yaml
    scheme:
      testTargets: [MyAppTests, MyAppUITests]
      gatherCoverageData: true
      coverageTargets: [MyApp]
```

## Resources that need an explicit build phase

XcodeGen infers most file types. Force these when in doubt:

```yaml
    sources:
      - path: App
      - path: Config/PrivacyInfo.xcprivacy
        buildPhase: resources
```

`PrivacyInfo.xcprivacy` must be in the app bundle root. Required-reason APIs used by a
typical starter app: `NSPrivacyAccessedAPICategoryUserDefaults` (`CA92.1`) and
`NSPrivacyAccessedAPICategoryFileTimestamp` (`C617.1`) — declare only what you use.

## Adding dependencies

```yaml
packages:
  SnapshotTesting:
    url: https://github.com/pointfreeco/swift-snapshot-testing
    exactVersion: 1.18.3
```

- Pin `exactVersion` for test-only libraries; use `from:` for the app's own libraries.
- Commit `Package.resolved` for every app/test target.
- The build scripts add `-onlyUsePackageVersionsFromResolvedFile` and
  `-skipPackagePluginValidation` when a resolved file exists, and fail with a readable
  message when it does not.
- Never add a package just for one helper. Every dependency is a future build failure.

## Adopting an existing project

1. `xcodebuild -list -json` → record targets and schemes.
2. `xcodebuild -showBuildSettings -scheme <s> -configuration Debug` → record the settings
   that differ from defaults (deployment target, bundle id, entitlements, capabilities).
3. Write `project.yml` for **one** target; generate into `Generated/` with a different
   `name:` and compare `xcodebuild -showBuildSettings` output for that target. Diff must be
   empty apart from paths.
4. Only then replace the committed project, and delete the old one in the same commit.
5. If the project has one-off pbxproj edits (custom build phases, shell scripts), port the
   **script** into `project.yml` `preBuildScripts`/`postCompileScripts` — do not leave the
   project half-generated.

If the diff cannot be made empty, stop and report which settings could not be expressed.
That is a real finding, not something to paper over.

## Generated project hygiene

- `.gitignore`: `*.xcodeproj`, `*.xcworkspace`, `.build/`, `DerivedData/`, `artifacts/`.
- Regenerate after every `project.yml` change and in CI before building.
- A stale generated project is the most common "works on my machine" cause: `gen.sh` verifies
  that every scheme listed in the spec exists after generation.
- `scripts/gen.sh` also fails on `xcodegen` warnings (e.g. a source path that does not exist),
  because a missing source directory silently produces an empty target.
