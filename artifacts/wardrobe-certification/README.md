# Sunny wardrobe — incomplete engineering handoff

**Status: BLOCKED / INCOMPLETE. No store approval. Do not merge or deploy this branch as a completed wardrobe.**

Matilda's complete face, hair, blink and mouth expressions survive the prepared path. Her shoulder/upper-arm surfaces still show dark protrusions and discontinuities in the controlled dress preview. The required architecture proof gate therefore fails. Three distinct body-preparation attempts were made; further geometry/UV/weight repair is stopped under the approved attempt limit. Hoodie/blazer fitting and the full accessory matrix have not proceeded past this gate.

The isolated checkout is `/Users/jamaltaylor/.codex/worktrees/wardrobe-identity/sunny`, branch `codex/wardrobe-identity-preservation`. The original Sunny checkout and wardrobe sandbox were not edited. `isolation.json` identifies the preserved source state, patch fingerprint and copied ignored asset directories. The initial preservation commit is `a063c76`.

## Deliverable status

| Deliverable | Result |
|---|---|
| Isolated reproducible baseline | Complete locally. Staged/unstaged web wardrobe changes and required ignored assets preserved; dependencies cloned separately. |
| Eight-companion asset audit | Structural audit and diagnostic previews supplied. Princess facial masking has a specific reproduced cause. Detailed mesh/material/texture/rig/expression inventories are in `asset-audit.json`; raw pixels are excluded. |
| Prepared Elli/Matilda identities | Candidate outputs reproducible with pinned input hashes. Matilda face preservation demonstrated; body coverage fails. Original clothing is explicitly tagged, but baked texture details and the restored body's UV/weights still need repair. |
| Dress/hoodie/blazer and accessories | Incomplete. Existing archives have distinct meshes (not recolors): dress 6,282 vertices; hoodie 1,754; blazer 4,830. Only dress fitting progressed. Full garment/accessory certification remains blocked. |
| Runtime switching | Consolidated loading, immediate visibility gate, stale-result disposal, explicit unavailable state and GPU skeleton cleanup implemented. See browser/unit results for measured scope. |
| Certification package | Audit/evidence and explicit incomplete matrix supplied. Exact version checks fail closed; no human approvals entered. Pair-specific garment/accessory certification is still missing. |
| Verified handoff | Local checks and independent review recorded below. This is a preserved incomplete implementation, not engineering-ready approval. |

## Reproduce locally

Use the isolated checkout. Dependencies are installed locally; no secret file is needed for the diagnostic lab. Required ignored files are listed in `isolation.json`, `scripts/wardrobe-recipes.json` and `web/wardrobeAssets.ts`.

```sh
npx tsx scripts/prepareWardrobe.ts
npx tsx scripts/auditWardrobe.ts
VITE_MODE=intro npm --prefix web run dev -- --host 127.0.0.1 --port 5197 --strictPort
```

Open `http://127.0.0.1:5197/?wardrobeLab=true&wardrobeCompatibilityLab=true&grokBackground=false`.

In a second terminal from the same checkout:

```sh
node scripts/verifyWardrobeAcceptance.mjs
node scripts/verifyWardrobeSwitching.mjs
WARDROBE_STAGE=audit-final node scripts/verifyWardrobeRendering.mjs
npm run build
npm test
```

Preparation emits complete VRMs into ignored `web/public/companions/`, plus tracked version manifests. `sample.vrm` is Elli's exact identity reference; `673852811403133503.vrm` is Matilda's. Input fingerprint or material inventory changes stop conversion. The Matilda donor is mandatory. Prepared output bytes, garment archive bytes plus fitting code, and accessory implementation are fingerprinted. Any implementation edit requires rerunning preparation before evidence or approval.

The dress archive's local SOURCE.md prohibits raw/modified redistribution and easily extractable game inclusion. Raw XWear archives remain in the ignored `.sunny-sandbox/wardrobe` directory and are served only by an allowlisted local dev/preview endpoint. They are not committed or emitted into dist. A static deployment would not serve this wardrobe; distribution packaging/licensing is outside this local milestone and still unresolved.

## Evidence and failed proof gate

`acceptance/` contains equal-camera, equal-lighting source/prepared comparisons: front, side, back, face, blink, mouth opening, head turn, raised arms and synthetic leg swing. The corrected front camera faces the showroom's normalized +Z direction. These are rendered pose samples, not a production walking acceptance run or spoken-audio synchronization proof.

- `acceptance/matilda-dress-face-idle.png`: recognizable face preserved; shoulder/upper-arm defects visible.
- `acceptance/matilda-dress-face-blink.png`: both reference and prepared face blink.
- `acceptance/matilda-dress-face-speak.png`: mouth-expression sample.
- `acceptance/matilda-dress-front-arms-up.png` and `...side-idle.png`: arm movement and silhouette evidence; still insufficient for acceptance.
- `runtime-*.png`: preserved earlier legacy-composite baseline under the compatible renderer.
- `audit-final-*.png`: current attempted previews of all eight companions. Six non-migrated companions still use the legacy diagnostic overlay; they are not conversions.
- `matilda-body-repair.png`: rejected donor-axis attempt.
- `matilda-body-repair-anchors.png`: corrected body anchors before garment-handedness correction.
- `fit-handedness-matilda.png`: intermediate corrected garment front, before controlled inspection captures.

The body repair attempts were:

1. Complete original Matilda plus explicit original-clothing separation. Revealed missing underlying arm/torso geometry and alpha-cut body coverage. The original skin primitive has 8,320 triangles; the donor has 8,864, and substantially more arm-region vertices.
2. Transfer the donor body through inverse-bind orientations while preserving Matilda's rig/face. Rejected flattened/fanned geometry: exporter bone axes differ, and the scalp maximum Y dropped to about 1.426.
3. Transfer through authored T-pose joint anchors with VRM coordinate conversion. Restored coherent body/arms and preserved face. Controlled captures still show shoulder/upper-arm defects. No fourth fit adjustment is authorized by this milestone's stopping rule.

Required next dependency: manual inspection and repair of Matilda's restored body topology, skin weights and body UV/texture coverage in a capable VRM mesh editor, or an identity-matching complete source body from its author. Blender is absent from PATH, `/Applications/Blender.app`, `/opt/homebrew/bin/blender` and `/usr/local/bin/blender`. Installing an editor alone would not establish visual correctness. Once repaired, rerun the Matilda dress gate before fitting the remaining families.

## Why the human caught what the lab missed

| Regression | Human-visible evidence | Why logs missed it | Missing lab invariant / new evidence |
|---|---|---|---|
| Princess flat/incomplete expression surfaces | Legacy composite loses complete mouth/expression surfaces. | Logs counted masks/materials, not semantic face completeness. | Real asset has one mesh split into nine material primitives. Complete mouth/blink/happy primitives are 100% head-weighted; mask helper returns false when all indices survive, then opaque materials without identity names are hidden. Audit records retained/total triangles per primitive. Princess remains quarantined; no threshold patch claims to fix her. |
| Missing/washed VRM material surfaces | Faces/materials displayed incorrectly despite successful loading. | Download/attach success did not mean ShaderMaterial was compatible with WebGPU. | Browser red captured 268 incompatible-material errors. Candidate wardrobe previews use the existing compatible WebGL path; browser asserts no backend/material mismatch. |
| Distorted/backwards dress | Garment fronts and shoulders deform or face backwards. | Mesh attachment succeeded, so logs reported applied. | T-pose anchor regression replaces exporter local-axis dependence; Unity handedness reflection includes normals and triangle winding. Screenshots remain authoritative for coverage. |
| Matilda gaps after clothing removal | Source body has missing surfaces; repaired body still has visible shoulder defects. | Identity metadata and triangle counts cannot prove watertight skin or good UV/weights. | Pinned source/explicit clothing-role tests plus real-asset surface diagnostics and controlled movement captures. Gate explicitly fails rather than inheriting a body-profile approval. |
| Stale or failed selection | A previous/incomplete presentation could remain visible. | Independent model/outfit success logs did not certify a complete current selection. | One loading path and selection key; immediate CSS hiding, settled-key comparison, explicit failure state, bounded browser frame checks and out-of-order delivery. |
| Mislabelled inspection views/poses | “Front” showed back; idle arms were raised. | Lab camera/pose setup had no own invariant. | Normalized +Z front and idle-arm tests fail before fix; corrected captures replaced misleading samples. |

## Runtime architecture and remaining restrictions

Elli/Matilda now load complete prepared VRMs with their original identity rigs and expression metadata. They do not use face extraction or a second-avatar identity overlay. The six other diagnostic cases retain the legacy overlay, with restrictions in the matrix. Model-specific clothing selections and donor preparation live in versioned recipe data.

The fitting path now converts XWear T-pose anchors, handedness and winding. It removes runtime helper-bone insertion and its ambiguous local-axis correction. Fitting still occurs at runtime: the requested separately prepared offline fitted garment output is not delivered. Accessory anchors are existing generic anchors; model-specific validated anchors are not delivered.

The duplicate outfit-loading effect was deleted. A complete selection key covers model, identity overlay, outfit, material and accessory. Setup cleanup cancels the generation; only a complete current result may reveal. Full selection changes reload the presentation, which trades performance for a simpler lifecycle. Failed loads remain hidden and show an unavailable state. Garment removal disposes its skeleton texture as well as geometry/materials; prepared VRM disposal uses VRMUtils.deepDispose.

Store eligibility requires version-matching certification and explicit human-review metadata. Current records lack that evidence and stay quarantined. “Universal” accessories do not bypass approval. Remaining certification limitations: records cannot yet restrict an accessory to a particular garment pairing, and Matilda's `vroid-slim-v1` catalog/runtime fit eligibility must be reconciled before a future approval can enable her dress. These are contained by quarantine, not complete implementations.

Necessary additions are asset preparation, real-asset invariants, inspection tooling and evidence. Runtime fitting and switching remove duplicated logic. No learning-loop, math, conversation prompts, provider calls, source-checkout edits, merge or deployment form part of this handoff.

## Verification

Final results: `npm run build` passed; all 829 web tests across 105 files passed; browser switching passed with 228 sampled frames and no violations. Full `npm test` failed five root tests in unchanged non-wardrobe paths (2,782 passed); its web phase did not run, so the full web suite was run separately. No passing full-suite claim is made.

See `verification.json` for final command results and `independent-review.md` for findings and dispositions. Passing automated checks do not override the failed visual gate. `certification-record.json` lists versions, tested/untested combinations, restrictions and next steps; all records have no human approval.
