import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  inspectXwearArchiveEntries,
  parseWardrobeCandidateManifest,
} from "../wardrobe/xwearCandidateManifest";

type IngestXwearCandidateOptions = {
  archiveFile: string;
  manifestFile: string;
  candidateRoot?: string;
};

function readArchiveEntries(archiveFile: string) {
  const result = spawnSync("unzip", ["-Z1", archiveFile], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `wardrobe candidate archive could not be inspected: ${result.stderr.trim()}`,
    );
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

export function ingestXwearCandidate(options: IngestXwearCandidateOptions) {
  const archiveFile = path.resolve(options.archiveFile);
  const manifestFile = path.resolve(options.manifestFile);
  if (path.extname(archiveFile).toLowerCase() !== ".xwear") {
    throw new Error("wardrobe candidate must be an .xwear archive");
  }
  if (!fs.statSync(archiveFile).isFile() || !fs.statSync(manifestFile).isFile()) {
    throw new Error("wardrobe candidate archive and manifest must be files");
  }

  const manifest = parseWardrobeCandidateManifest(
    JSON.parse(fs.readFileSync(manifestFile, "utf8")) as unknown,
  );
  const inspection = inspectXwearArchiveEntries(readArchiveEntries(archiveFile));
  if (!inspection.ok) {
    throw new Error(
      `wardrobe candidate is missing required XWear paths: ${inspection.missing.join(", ")}`,
    );
  }

  const candidateRoot = path.resolve(
    options.candidateRoot ??
      path.join(process.cwd(), ".sunny-sandbox", "wardrobe", "candidates"),
  );
  const destination = path.join(candidateRoot, manifest.id);
  if (fs.existsSync(destination)) {
    throw new Error(`wardrobe candidate already exists: ${manifest.id}`);
  }
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(archiveFile, path.join(destination, "outfit.xwear"));
  fs.writeFileSync(
    path.join(destination, "candidate.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(
    ` 🎮 [wardrobe-candidate] ingested id=${manifest.id} status=candidate publishable=false`,
  );
  return { destination, manifest };
}

function readFlag(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`missing required ${name} value`);
  }
  return value;
}

if (require.main === module) {
  try {
    ingestXwearCandidate({
      archiveFile: readFlag("--file"),
      manifestFile: readFlag("--manifest"),
    });
  } catch (error) {
    console.error(" 🎮 [wardrobe-candidate] ingest failed", error);
    process.exitCode = 1;
  }
}
