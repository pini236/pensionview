import mupdf from "mupdf";

/**
 * Decrypts a password-protected PDF and returns an unencrypted PDF buffer.
 *
 * Uses mupdf (WASM port of MuPDF) — pure JavaScript/WASM, runs in Vercel
 * serverless without any native binaries.
 *
 * MuPDF clears encryption when you save the document without re-encrypting,
 * so `saveToBuffer()` with no options produces a clean, Claude-readable PDF.
 *
 * @param encryptedBuffer - The raw bytes of the encrypted PDF
 * @param password - The plaintext password (for Surense: the user's national_id)
 * @returns Buffer containing the decrypted PDF
 * @throws If the password is wrong or the PDF is malformed
 */
export async function decryptPdf(
  encryptedBuffer: Buffer,
  password: string
): Promise<Buffer> {
  const doc = mupdf.Document.openDocument(encryptedBuffer, "application/pdf");

  if (doc.needsPassword()) {
    // authenticatePassword returns 0 on failure, non-zero (1 = user, 2 = owner) on success
    const authResult = doc.authenticatePassword(password);
    if (!authResult) {
      doc.destroy();
      throw new Error("PDF password is incorrect — decryption failed");
    }
  }

  const pdfDoc = doc.asPDF();
  if (!pdfDoc) {
    doc.destroy();
    throw new Error("Document is not a PDF — cannot decrypt");
  }

  // saveToBuffer with no options produces an unencrypted PDF.
  // MuPDF does not re-apply encryption unless you explicitly pass encrypt options.
  const mupdfBuffer = pdfDoc.saveToBuffer();
  const output = Buffer.from(mupdfBuffer.asUint8Array());

  mupdfBuffer.destroy();
  doc.destroy();

  return output;
}
