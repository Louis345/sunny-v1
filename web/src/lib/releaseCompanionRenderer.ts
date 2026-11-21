/**
 * One teardown for every companion renderer (S8, 2026-11-14). three's dispose() frees GPU buffers but keeps the WebGL
 * context alive until garbage collection; past the browser's live-context limit the oldest context (a long-lived call
 * tile) is lost and draws nothing. forceContextLoss() hands the context back now. WebGPU renderers have no context to
 * release, so they are only disposed.
 */
type ReleasableRenderer = {
  domElement: HTMLCanvasElement;
  dispose: () => void;
  forceContextLoss?: () => void;
};

export function releaseCompanionRenderer(renderer: ReleasableRenderer, owner: string): void {
  renderer.domElement.remove();
  renderer.dispose();
  if (typeof renderer.forceContextLoss === "function") {
    try {
      renderer.forceContextLoss();
    } catch (error: unknown) {
      console.error(` 🎮 [${owner}] [renderer] [context_release_failed]`, error);
      return;
    }
  }
  console.log(` 🎮 [${owner}] [renderer] [released] context=${typeof renderer.forceContextLoss === "function" ? "webgl_released" : "none"}`);
}
