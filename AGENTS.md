# Controller workshop project instructions

- Follow the user's current task and authorization. Make routine reversible choices without introducing approval steps.
- The browser uses JavaScript ES modules. The Node entry point is `server/index.cjs`; keep the CommonJS boundary explicit. Use Node.js 22+ and the dependency lockfile.
- Keep runtime credentials out of `public/` and Android source. OpenCode/OmniRoute are development tools, not game dependencies.
- Preserve the supplied OpenWii renderer/game and its exact attribution in `licenses/`.
- Put all unit checks in `tests/`; audit, native and workshop scripts belong in their named subfolders. Do not put tests or machine output under served source.
- Center blade binds a captured pose to a calibration epoch. Preserve ordering protection, held aim, stroke resets and the 15-byte BLE Center command. See `docs/CENTER-BLADE.md`.
- Run checks appropriate to the changed layer. Browser sensor/GATT fixtures do not establish physical phone or radio performance.

## Current product goal

Read `workshop/FINAL-SYSTEM.md` and `workshop/PROMPT-SPEC.md` for the reusable Android/iOS Wii-style controller target. The current Air Slice source is the working reference. Keep its renderer, calibration and useful transport contracts while introducing common controller/profile/game interfaces.

Game-specific controller labels and mappings must come from profiles. The cross-platform foundation is a phone web interface with explicit motion permissions and usable button fallback. Follow the final visual references and fixed protocol/API when they are produced.

The existing `workshop/STAGE-PROMPTS.md` is the previous Air Slice reference sequence. New participant prompts must come from the completed and tested controller system, with clear copy boundaries, outcomes, checks and recovery. Do not describe the planned universal controller as already implemented.

## Air Slice reference reconstruction

When `.workshop/manifest.json` exists, work within the requested checkpoint. Read `workshop/STAGE-PROMPTS.md` and stage ownership in `workshop/stages.json`.

Use `npm run workshop:stage -- N` to reconstruct the next stage from the frozen reference, then `npm run workshop:verify -- N`, `npm test` and `npm run audit:stage -- N`. Keep the reference/manifest and earlier stages intact. Do not weaken tests to pass a generated implementation. Explain the restored code and observed result.

Provider configuration files, installed packages, certificates, reports, SDK paths and native build output are local artifacts excluded from reconstruction hashes. The hidden workshop reference is required when sharing the staged kit; the finished-game export excludes it.
