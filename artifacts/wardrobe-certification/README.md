# Sunny wardrobe — implementation progress and incomplete handoff

**Status: INCOMPLETE. No store approval, merge or deployment.**

The reopened Matilda repair succeeded. Complete faces, hair, native expression bindings and rigs are retained. The arm defect came from donor aim/roll helpers being mapped to a stationary shoulder; explicit versioned mappings now transfer all 5,307 donor-body vertices through the correct moving joints. The Matilda dress proof passed the captured blink, mouth, head-turn and arm poses. This is not a walking or spoken-audio synchronization certification.

Both Elli and Matilda now have separate prepared dress, hoodie and blazer fits. The hoodie and blazer use distinct meshes and silhouettes. Matilda's intersecting outer skirt panels are replaced with the top while the base skirt remains. Her native halo is separately tagged, allowing a selected accessory to replace it without altering hair geometry. Crown, cat-ear and halo anchors are versioned against each prepared identity. Cat-ear placement uses measured hair surfaces under the cone bases; whole-avatar scale and failed-attachment cleanup have regression tests.

The isolated checkout is `/Users/jamaltaylor/.codex/worktrees/wardrobe-identity/sunny`, branch `codex/wardrobe-identity-preservation`. The original checkout and wardrobe sandbox are outside this work. `isolation.json` records the preserved staged/unstaged wardrobe state and required ignored assets.

## Deliverables

| Deliverable | Current result |
|---|---|
| Isolated baseline | Preserved locally with source patch fingerprint and independent dependencies. |
| Eight-companion audit | Mesh/material/texture/rig/expression inventories and attempted previews provided. Six companions remain quarantined with specific restrictions. |
| Prepared Elli/Matilda | Elli identity-preserved-v1; Matilda identity-preserved-v4. Original face, hair geometry, expression bindings and rigs retained. Matilda donor arm mappings repaired; clothing and intrinsic halo explicitly separated. |
| Three garment families/accessories | Six offline fitted garment assets generated. Versioned accessory anchors and comparison captures supplied. Full mandatory visual certification is incomplete. |
| Runtime switching | Current-selection visibility gate, stale-result disposal, explicit unavailable state and prepared-file integrity checks implemented. |
| Certification | Exact source/body/recipe/fitted-output checks plus garment/accessory pair version checks. Prepared runtime activation uses exact certification; legacy QA metadata cannot override it. No human approvals entered. |
| Verified handoff | Build, web suite, full-suite result, browser evidence and independent readonly review recorded in verification.json. Overall engineering readiness remains incomplete. |

## Remaining requirements

- A compatible walking animation is missing. No walking/locomotion FBX, VRMA, GLB or JSON was found in the copied local wardrobe/public assets. Existing `leg-swing` is deliberately labelled synthetic. Supply an authored compatible walking clip and exercise its full cycle on all six fits; do not relabel the synthetic pose as a pass.
- Complete the remaining current-version movement, palette and accessory visual certification, including any defects recorded in `certification-record.json`. Static captures and passing tests cannot certify all intermediate movement frames or spoken-audio synchronization.
- Full `npm test` has failures outside wardrobe scope. They are listed with the actual latest counts in `verification.json`; no learning/math fixes are included.
- Explicit human approval must name the delivered asset versions and combinations. No candidate, shared body profile or universal accessory label grants approval.

## Reproduce

From this isolated checkout, with the copied ignored source assets and installed dependencies:

```sh
npx tsx scripts/prepareWardrobe.ts
VITE_MODE=intro npm --prefix web run dev -- --host 127.0.0.1 --port 5197 --strictPort
```

In another terminal, after Vite is ready:

```sh
npx tsx scripts/prepareWardrobeGarments.ts
node scripts/verifyWardrobeMatrix.mjs
node scripts/verifyWardrobeSwitching.mjs
npm run build
npm test
npm --prefix web test
```

Lab URL: `http://127.0.0.1:5197/?wardrobeLab=true&wardrobeCompatibilityLab=true&grokBackground=false`.

Prepared VRMs remain in ignored `web/public/companions/`. Six fitted JSON files, including their textures, remain in ignored `.sunny-sandbox/wardrobe/prepared/`. Tracked manifests identify their exact hashes. Source fingerprint or material-inventory changes stop preparation. Run both preparation commands after fitting-code or recipe changes. The fitted index is written only after all six outputs succeed; stale/missing outputs cannot silently fall back to runtime fitting for a migrated model.

The dress source prohibits raw/modified redistribution and easily extractable game inclusion. Local licensed files are served by an allowlisted development/preview route and are not committed or emitted into dist. Static deployment packaging/licensing remains unresolved and was not attempted.

## Evidence

- `repair-resume/acceptance-v2/`: successful reopened Matilda body/dress proof, including unobstructed front/side bent-elbow views.
- `garment-families/`: earlier distinct hoodie/blazer previews; `panels-v3/` shows the corrected skirt-layer separation; `prepared/` checks saved geometry against the earlier runtime-fitted result.
- `accessory-baseline/`: 132 baseline captures across both companions, three families, views, expressions and all accessories. These expose the floating ears and duplicate halo.
- `accessory-first-fit/`: intermediate rejected scalp-maximum placement. Retained as diagnostic evidence, not final certification.
- `current-matrix/`: 72 indexed accessory comparisons with exact captured source/body/garment/accessory versions. `fit-evidence-equivalence.json` verifies that the final activation-gate change altered only fitted-file sourceVersion metadata; every geometry, texture, binding and body value matches these captures. Human approval is still invalidated for the new file hashes. Consult capture results, not filenames alone, for completed checks.
- `repair-resume/ear-surface.json`: actual raycast samples under ear bases; `hair-components-summary.log` identifies the separate native-halo material.
- `asset-audit.json`, `audit-final-*.png`, `compatibility-matrix.md`: all-eight structural audit and precise restrictions for the six remaining companions.
- `acceptance/` and earlier repair screenshots: rejected v1 history. The previous incomplete handoff is preserved in commit `328f830`; its Matilda body blocker is superseded by the reopened repair.

## Human-caught failures and lab invariants

| Failure | Why the human saw it while logs/lab missed it | New invariant/evidence |
|---|---|---|
| Princess malformed face | Mask/material counts did not prove semantic face completeness. Fully head-weighted mouth/expression primitives hit a false-return masking path and were hidden. | Exact source primitive audit explains the failure; Princess stays quarantined pending complete-identity preparation. |
| Incompatible material rendering | Download/attach success ignored ShaderMaterial/WebGPU incompatibility. | Candidate wardrobe uses compatible WebGL; browser checks reject incompatible-material errors. |
| Backwards/distorted garment | Exporter bone axes and handedness were treated as interchangeable. | T-pose anchor conversion, normal/winding reflection and controlled views. |
| Matilda arm protrusions | Metadata/triangle counts could not identify donor constraint helpers attached to the wrong limb. | All ten helper mappings and all 5,307 body vertices verified; material ablations separated geometry defects from shading. |
| Hoodie waist overlap | Successful attachment and clothing-name classification retained an outer panel crossing the hoodie. | Material-ID render identifies material16; versioned recipe replaces outer layers16/17 with the top while retaining the base skirt9/14. |
| Floating/duplicated accessories | Generic world offsets ignored the existing halo, curved scalp and avatar scale. | Explicit halo material25, measured ear-base surfaces, versioned fits, head-motion/scale tests and failed-fit disposal checks. |
| Stale or failed selection | Independent asynchronous success logs did not prove a complete current presentation. | Selection generation/key visibility gate, stale-result disposal, failed-load state and frame-sampled browser switching. |
| Inherited approval | Source-code hashes alone did not identify changed fitted bytes or a new garment/accessory pairing. | Exact fitted SHA plus pair identity including body, recipe, variant and accessory; failed/candidate results never become human approval. |

## Architecture and review

Migrated Elli/Matilda load one complete prepared identity. They do not use runtime face extraction or dual-avatar overlays. Six legacy diagnostic cases retain the old overlay with explicit restrictions. Offline garment preparation reuses the existing XWear ingestion/fitter; migrated runtime loads precomputed coordinates, validates hashes and binds to the live rig. Runtime refitting remains only for legacy diagnostic models and explicit preparation calls.

The old duplicate outfit effect and helper-bone insertion were removed earlier in this branch. Additions are the requested preparation/data path, integrity/lifecycle invariants, diagnostic controls and evidence. Accessory hiding acts only on explicitly tagged intrinsic headwear. No learning-loop, math, conversation, provider or source-checkout changes are part of this milestone.

`independent-review.md` records review findings and their disposition. Passing code review or tests does not override the outstanding mandatory acceptance checks.
