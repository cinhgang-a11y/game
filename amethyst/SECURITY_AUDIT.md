# Security Audit: Amethyst-Android clone

Source: https://github.com/AngelAuraMC/Amethyst-Android (cloned into `amethyst/`,
shallow clone of the default branch `v3_openjdk`, commit `11c999b`).

Amethyst is a Minecraft: Java Edition launcher for Android/iOS, forked from
PojavLauncher (which is discontinued) and actively maintained. This audit
covers the Android source in this clone.

## Result: no malicious code found

Checks performed:

- Grepped all Java/Kotlin/C sources for shell-exec / reverse-shell patterns
  (`Runtime.exec`, `ProcessBuilder`, `popen`, `system(`, `/bin/sh`) — only
  benign, expected uses: launching the game's JRE process (`MultiRTUtils`),
  capturing `logcat` output for in-app logs (`JREUtils`), and an unrelated
  native `initSubsystem()` call in `input_bridge_v3.c`.
- Checked for root/Frida/Xposed detection or evasion — no real matches. One
  grep hit on "Xposed" was a false positive: the substring "xposed" appears
  inside the English word "exposed" in a code comment.
- Checked for obfuscated or base64-decoded-then-executed payloads — the only
  `Base64.decode` calls are in `MinecraftAccount.java` and
  `ProfileIconCache.java`, decoding account/skin data, not code.
- Enumerated every hardcoded URL/host referenced in source — all are known,
  expected Minecraft-ecosystem endpoints (Mojang/Xbox auth, CurseForge,
  Modrinth, Forge/NeoForge/Fabric/Quilt, LWJGL, BMCLAPI mirror, skin/cape
  services, the project's own GitHub/wiki/Discord). No unknown telemetry or
  C2-style hosts. A one-off "cosmatica.cc" (vs. the correct "cosmetica.cc")
  found in a single Hungarian translation string is a translator typo, not a
  separate domain — every other locale (30+) consistently references
  `cosmetica.cc`.
- Reviewed `arc_dns_injector` (the one component that manipulates DNS
  resolution): unchanged from upstream PojavLauncher behavior — it remaps
  `s.optifine.net` to the Cosmetica cape service (formerly "Arc"), logging
  what it does and crediting the technique's source (Alibaba's
  `java-dns-cache-manipulator`). Disclosed, intentional, not a hidden MITM
  tool.
- Reviewed the new `methods_injector_agent` module (not present in vanilla
  PojavLauncher) — a `-javaagent` that bytecode-patches specific classes at
  JVM startup for mod compatibility:
  - `ASM5OverrideInjector`: disables an overly strict API-version check in
    bundled ASM 5.0.4 so older mods built against ASM 4 still load.
  - `ALC10Injector`: adds a missing `alcGetCurrentContext()` overload to
    LWJGL2's `ALC10` class for sound-mod compatibility.
  - `VeilImguiOverrideDisable`: patches a known bug in the Veil mod
    (≤3.1.0) that hardcodes the wrong native library name on ARM, linking
    to the upstream Veil commit that fixes it.
  All three transformers target one specific, named class each, print what
  they're doing, and modify nothing outside the declared compatibility fix.
  No network access, no dynamic code fetched from a remote source.
- Reviewed `AndroidManifest.xml` permissions — storage (legacy, maxSdk 28),
  internet, network state, audio, notifications, foreground service,
  vibrate. Nothing unexpected (no SMS, contacts, location, camera).
- Reviewed signing configs in `app_pojavlauncher/build.gradle`: `debug.keystore`
  uses Android's universal, public debug password (`android`) — standard,
  can't sign a release build. `aamc_upload.jks` is present as an opaque
  encrypted blob (confirmed by testing with an empty password — rejected);
  its real password comes from a CI-only env var (`GPLAY_KEYSTORE_PASSWORD`)
  not present in the repo, so no usable release signing material is exposed.
  `upload.jks` (the Google Play variant referenced by the `googlePlayBuild`
  signing config) is not present in this clone at all.
- Searched for hardcoded API keys/secrets/private-key material — none found.
- `.gitmodules` lists three submodules (MobileGlues, SDL, sdl2-compat), but
  none have gitlink entries in the current tree (`git ls-tree` at HEAD shows
  no `160000` mode entries for those paths) — the build now consumes them as
  prebuilt `.aar` files in `app_pojavlauncher/libs/` instead, confirmed by
  `Android.mk` having no references to the old source paths. `.gitmodules`
  is vestigial; nothing was fetched from those submodule URLs for this
  build, and nothing needed to be.

## Conclusion

Same conclusion as the prior PojavLauncher audit: this is a legitimate,
actively maintained Minecraft launcher fork. The additions over vanilla
PojavLauncher (methods_injector_agent, rebranded cape service) are disclosed
mod-compatibility functionality, not malicious code.
