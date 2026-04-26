#!/usr/bin/env node
/**
 * Downloads companion .vrm files into web/public/companions/ from GitHub Release assets.
 *
 * Create a release tagged `releaseTag` (see companion-vrms.manifest.json), attach each .vrm
 * with the same filename as listed under `assets`. Direct URL shape:
 *   https://github.com/<githubRepo>/releases/download/<releaseTag>/<filename>
 *
 * Env:
 *   SKIP_COMPANION_VRM_DOWNLOAD=1  — exit 0 without downloading (e.g. CI until release exists)
 *   FORCE_COMPANION_VRM_DOWNLOAD=1  — re-download even if large files already exist
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(__dirname, "companion-vrms.manifest.json");
const outDir = path.join(repoRoot, "web", "public", "companions");

function log(action, result) {
  console.log(` 🎮 [download-companion-vrms] [${action}] [${result}]`);
}

function releaseAssetUrl(githubRepo, releaseTag, filename) {
  return `https://github.com/${githubRepo}/releases/download/${releaseTag}/${encodeURIComponent(filename)}`;
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function readManifest() {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const data = JSON.parse(raw);
  if (typeof data.githubRepo !== "string" || !data.githubRepo.includes("/")) {
    throw new Error("manifest.githubRepo must be a string like Owner/repo");
  }
  if (typeof data.releaseTag !== "string" || data.releaseTag.length === 0) {
    throw new Error("manifest.releaseTag must be a non-empty string");
  }
  const minBytes =
    typeof data.minBytesToTreatAsPresent === "number" && data.minBytesToTreatAsPresent > 0
      ? data.minBytesToTreatAsPresent
      : 1_000_000;
  if (!Array.isArray(data.assets) || data.assets.length === 0) {
    throw new Error("manifest.assets must be a non-empty array");
  }
  const assets = data.assets.map((a, i) => {
    if (!a || typeof a.filename !== "string" || !a.filename.toLowerCase().endsWith(".vrm")) {
      throw new Error(`manifest.assets[${i}].filename must be a .vrm string`);
    }
    if (a.filename !== path.basename(a.filename)) {
      throw new Error(`manifest.assets[${i}].filename must be a bare filename, got ${a.filename}`);
    }
    const sha256 = typeof a.sha256 === "string" && /^[a-f0-9]{64}$/i.test(a.sha256) ? a.sha256.toLowerCase() : null;
    return { filename: a.filename, sha256 };
  });
  return { githubRepo: data.githubRepo, releaseTag: data.releaseTag, minBytesToTreatAsPresent: minBytes, assets };
}

async function downloadToFile(url, destPath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const hint = body.includes("<!DOCTYPE") ? " (response looks like HTML — check release tag and asset names)" : "";
    throw new Error(`HTTP ${res.status} for ${url}${hint}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = `${destPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, destPath);
  return buf;
}

async function main() {
  if (process.env.SKIP_COMPANION_VRM_DOWNLOAD === "1" || process.env.SKIP_COMPANION_VRM_DOWNLOAD === "true") {
    log("skip", "SKIP_COMPANION_VRM_DOWNLOAD set");
    return;
  }

  const manifest = readManifest();
  fs.mkdirSync(outDir, { recursive: true });

  const force = process.env.FORCE_COMPANION_VRM_DOWNLOAD === "1" || process.env.FORCE_COMPANION_VRM_DOWNLOAD === "true";

  for (const { filename, sha256 } of manifest.assets) {
    const dest = path.join(outDir, filename);
    const url = releaseAssetUrl(manifest.githubRepo, manifest.releaseTag, filename);

    if (fs.existsSync(dest) && !force) {
      const st = fs.statSync(dest);
      if (st.size >= manifest.minBytesToTreatAsPresent) {
        if (sha256) {
          const disk = fs.readFileSync(dest);
          const got = sha256Hex(disk);
          if (got !== sha256) {
            log("redownload", `${filename} sha256 mismatch (expected ${sha256}, got ${got})`);
          } else {
            log("skip", `${filename} already present (${st.size} bytes)`);
            continue;
          }
        } else {
          log("skip", `${filename} already present (${st.size} bytes)`);
          continue;
        }
      }
    }

    log("fetch", url);
    const buf = await downloadToFile(url, dest);
    if (sha256) {
      const got = sha256Hex(buf);
      if (got !== sha256) {
        fs.unlinkSync(dest);
        throw new Error(`${filename}: sha256 mismatch after download (expected ${sha256}, got ${got})`);
      }
    }
    log("wrote", `${filename} (${buf.length} bytes)`);
  }

  log("done", `${manifest.assets.length} asset(s) OK`);
}

main().catch((err) => {
  console.error(` 🎮 [download-companion-vrms] [error] [${err.message}]`);
  console.error(
    "\nIf the GitHub release is not published yet, use SKIP_COMPANION_VRM_DOWNLOAD=1 for npm ci, or keep .vrm files in web/public/companions/ locally.\n",
  );
  process.exit(1);
});
