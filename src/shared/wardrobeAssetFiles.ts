import path from "node:path";

/** Garment archives by public name. The licensed raw files live only in the git-ignored `.sunny-sandbox/wardrobe`. */
export const WARDROBE_ARCHIVES: Readonly<Record<string, string>> = {
  "sleeveless-dress.xwear": "sleeveless-dress/sleeveless_dress_Free.xwear",
  "comet-hoodie.xwear": "vroid-hoodie/sunny-hoodie-neutral.xwear",
  "constellation-blazer.xwear": "vroid-blazer/sunny-blazer.xwear",
  "celtic-sweater.xwear": "celtic-sweater/Celtic_Holiday_V1_Blue.xwear",
};

export const WARDROBE_ASSET_PREFIX = "/__wardrobe-assets/";

/**
 * The one map from a wardrobe asset address to a local file, shared by the development server and the kiosk
 * server: a prepared fit must be on the generated allowlist, an archive must be named above, nothing else resolves.
 */
export function resolveWardrobeAssetFile(url: string, options: { assetRoot: string; preparedUrls: readonly string[] }): string | undefined {
  if (!url.startsWith(WARDROBE_ASSET_PREFIX)) return undefined;
  const name = url.slice(WARDROBE_ASSET_PREFIX.length);
  if (options.preparedUrls.includes(url) && /^prepared\/[a-z0-9-]+\.json$/.test(name)) return path.join(options.assetRoot, name);
  const relative = Object.hasOwn(WARDROBE_ARCHIVES, name) ? WARDROBE_ARCHIVES[name] : undefined;
  return relative ? path.join(options.assetRoot, relative) : undefined;
}
