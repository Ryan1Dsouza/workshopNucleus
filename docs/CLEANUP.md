# Cleanup record

The working folder now contains one current application and its workshop material. The original source and removed material are preserved outside this project in `../workshopNucleus-backup-20261123-184018/`.

Removed from the active folder:

- The retired tennis/Fruit Frenzy archive.
- Seven old source exports and earlier browser/render artifacts.
- Unused OpenWii rate-pointer, gesture, calibration-wizard/channel/splash modules and their legacy-only tests.
- Redundant browser package manifests.

The game logic test moved out of served source into `tests/game-logic.test.mjs`. The active proportional pointer and its regression checks remain. The server moved to `server/index.cjs`; scripts are grouped by audit, native and workshop purpose.

Installed Node dependencies stay available for the working application. Machine certificates, Android SDK paths/caches and test/build output are ignored and excluded from both export formats. Output commands refuse to overwrite nonempty folders.

## Controller workshop reset — 23 November 2026

The workshop direction is now a reusable Wii-style Android/iOS phone controller. The Air Slice source, tests, licenses, dependencies and supplied BLE APK remain the implementation reference.

Archived outside the workspace at:

`C:/Users/ryan1/Downloads/workshopNucleus-backup-20261123-184018/controller-reset-20261123-205919-258/`

| Moved item | Reason |
|---|---|
| dist/ | Previous Fruit Ninja kits, ZIP and complete-source export. |
| test-results/ | Generated browser reports, screenshots and traces. |
| native/android/.gradle/ | Generated project Gradle cache. |
| workshop/BUILD-PROMPT.md | Superseded all-at-once Fruit Ninja reconstruction prompt. |
| workshop/opencode.v1.example.json | Superseded placeholder configuration; the organizer's workshop configuration remains. |

These moves removed 288 files, approximately 50 MB, from the active folder. `cleanup-manifest.json` in the archive records each moved path, file count and reason. Prior copies of edited guides are in its before-edit/ folder. The archived dist/ contains the complete previous source export and starter.

The workshop entry page now leads to [the final-system target](../workshop/FINAL-SYSTEM.md) and [the participant prompt specification](../workshop/PROMPT-SPEC.md). Existing Air Slice prompts/setup are labelled as reference material. The new platform and participant prompts are planned work, with implementation and checks required before publication.
