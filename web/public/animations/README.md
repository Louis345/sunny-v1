# Companion animation clips (FBX)

Place Mixamo (or compatible) **FBX** files here. They are loaded at runtime from `/animations/<filename>.fbx`.

## Adding a clip

1. Export or download an FBX for the animation you need.
2. Copy it into this directory (keep names stable, e.g. `wave.fbx`).
3. In `web/src/companion/animationRegistry.ts`, set the matching `AnimationName` row to `{ path: "/animations/wave.fbx", ... }`.

The `AnimationName` values are defined in `src/shared/companions/companionContract.ts` (`COMPANION_ANIMATION_IDS`). The `companionAct` tool’s `animate` capability only accepts those ids.

## Retargeting

Runtime retargeting from Mixamo skeleton to VRM lives in `CompanionMotor` (private load/retarget path).
