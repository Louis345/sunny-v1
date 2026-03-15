/**
 * Convert PDFs in src/intake/ to .txt files for the Document Ingester.
 * Run: npx tsx src/scripts/convert-pdfs-to-txt.ts
 */

import fs from "fs";
import path from "path";
import { extractText, getDocumentProxy } from "unpdf";

const INTAKE_DIR = path.resolve(process.cwd(), "src", "intake");

async function convertPdfToText(pdfPath: string): Promise<string> {
  const buffer = fs.readFileSync(pdfPath);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text ?? "";
}

async function main() {
  for (const child of ["ila", "reina"]) {
    const dir = path.resolve(INTAKE_DIR, child);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
    for (const file of files) {
      const pdfPath = path.resolve(dir, file);
      const baseName = path.basename(file, ".pdf");
      const txtPath = path.resolve(dir, `${baseName}.txt`);

      console.log(`  Converting: ${file} → ${baseName}.txt`);
      try {
        const text = await convertPdfToText(pdfPath);
        fs.writeFileSync(txtPath, text, "utf-8");
        console.log(`  ✅ Done`);
      } catch (err) {
        console.error(`  ❌ Failed:`, err);
      }
    }
  }
  console.log("\n  Conversion complete. Run `npm run ingest` to process the .txt files.\n");
}

main().catch(console.error);
