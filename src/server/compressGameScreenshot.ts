import sharp from "sharp";

/**
 * Resize screenshot to a small JPEG before sending to the model (token cost).
 * Input: raw base64 (no data-URL prefix), typically PNG from the voice client.
 */
export async function compressGameScreenshotBase64(
  imageBase64: string,
): Promise<string> {
  const buf = Buffer.from(imageBase64, "base64");
  const out = await sharp(buf)
    .resize(200, 150, { fit: "inside" })
    .jpeg({ quality: 30 })
    .toBuffer();
  return out.toString("base64");
}
