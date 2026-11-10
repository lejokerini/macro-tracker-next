// Compresse / redimensionne une image avant l'envoi à l'analyse (débit et coût).
// maxDim plus grand pour une étiquette (petits caractères à lire).
export async function compressImage(file: File, maxDim = 1280, name = "photo.jpg"): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ? new File([blob], name, { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}
