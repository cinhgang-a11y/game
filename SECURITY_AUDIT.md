# Security Audit: PojavLauncher clone

Source: https://github.com/PojavLauncherTeam/PojavLauncher (cloned into `pojavlauncher/`, shallow clone of `v3_openjdk`).

## Result: no malicious code found

Checks performed:
- Grepped all Java/Kotlin/C sources for shell-exec / reverse-shell patterns
  (`Runtime.exec`, `ProcessBuilder`, `popen`, `system(`, `/bin/sh`) — only
  benign, expected uses (git hash lookup in `build.gradle`).
- Checked for root/Frida/Xposed detection or evasion — none present.
- Checked for obfuscated or base64-decoded-then-executed payloads — the only
  `Base64.decode` calls decode Mojang skin/cape image data, not code.
- Enumerated every hardcoded URL/host referenced in source — all are known,
  expected Minecraft-ecosystem endpoints (Mojang/Xbox auth, CurseForge,
  Modrinth, Forge/Fabric/Quilt, LWJGL, skin/cape services). No unknown
  telemetry or C2-style hosts.
- Reviewed `arc_dns_injector` (the one component that manipulates DNS
  resolution): it remaps a single hostname, `s.optifine.net`, to a
  community cape server (`arcapes.com`), and logs what it's doing to the
  console along with a credit/link to the technique's source. This is
  disclosed, intentional launcher functionality (OptiFine capes aren't
  available to third-party clients), not a hidden MITM tool.
- Reviewed `AndroidManifest.xml` permissions — storage, internet, audio,
  notifications, foreground service. Nothing unexpected (no SMS, contacts,
  location, camera).
- Reviewed signing config: `debug.keystore` uses Android's universal, public
  debug password (`android`) — standard and can't sign a release build.
  `upload.jks` is an encrypted/placeholder file; its password comes from a
  CI-only env var (`GPLAY_KEYSTORE_PASSWORD`) not present in the repo, so no
  real signing key is exposed.
- Reviewed `build.gradle`/`settings.gradle` dependency repositories and
  library list — only `google()`, `mavenCentral()`, and `jitpack.io`, with
  mainstream AndroidX libraries and small utility libs from known Pojav
  contributors. No typosquats or unexplained custom repositories.

Nothing was stripped or patched, since nothing unsafe was found.

## Build status: blocked by session network policy

Attempted `gradle :app_pojavlauncher:assembleDebug`. This session's egress
policy blocks `dl.google.com` (HTTP 403), which is where Gradle's `google()`
repository shortcut actually resolves to (confirmed via `--info`:
`Failed to get resource: GET ... 403 Forbidden:
https://dl.google.com/dl/android/maven2/.../com.android.application.gradle.plugin-8.7.2.pom`).
That host serves the Android Gradle Plugin, the Android SDK platform, and
build-tools/NDK — required for any Android compile. Per the proxy's own
guidance, a 403 from an org egress policy should be reported, not routed
around, so no build artifact (APK) was produced in this environment.

To actually compile this, run it in an environment whose egress policy
allows `dl.google.com`, or with a pre-provisioned Android SDK/NDK already on
disk (no network fetch needed).
