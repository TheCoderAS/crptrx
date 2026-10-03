// Browser only. Uploads are capped at 200 KB (server: MAX_FILE_BYTES), but a phone
// photo of a card is 1-4 MB, so photos are scaled down and re-saved as JPEG until
// they fit. Text on a card stays readable at these sizes. PDFs can't be shrunk here.

export const MAX_UPLOAD_BYTES = 200 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];

export type ShrinkResult = { file: File; shrunk: boolean } | { error: string };

const UNREADABLE = "Your phone couldn't hand over this file. Wait a moment and pick it again.";

/**
 * Reads the whole file into memory before it's sent. Phones can hand the page a
 * picked file (Google Photos, a fresh screenshot) before it's fully available; sent
 * as is, the upload arrives cut short. Reading it first, and checking every byte
 * arrived, turns that into a clear message instead of a failed upload.
 */
export async function readFully(file: File): Promise<File | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > 0 && (file.size === 0 || bytes.byteLength === file.size)) return new File([bytes], file.name, { type: file.type, lastModified: file.lastModified });
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return null;
}

export async function fitUpload(file: File, opts: { imagesOnly?: boolean } = {}): Promise<ShrinkResult> {
  if (opts.imagesOnly && !["image/jpeg", "image/png"].includes(file.type)) return { error: "Only JPG or PNG images can be sent." };
  if (!ALLOWED.includes(file.type)) return { error: "Only JPG, PNG or PDF files are allowed." };
  if (file.size <= MAX_UPLOAD_BYTES) {
    const whole = await readFully(file);
    return whole ? { file: whole, shrunk: false } : { error: UNREADABLE };
  }
  if (file.type === "application/pdf") return { error: `This PDF is ${kb(file.size)}. PDFs must be 200 KB or smaller; a photo of the document works too.` };

  const whole = await readFully(file);
  if (!whole) return { error: UNREADABLE };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(whole, { imageOrientation: "from-image" });
  } catch {
    return { error: "We couldn't read this image. Try another photo." };
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { error: "Your browser can't resize photos. Use a file under 200 KB." };

  // Largest size first; step down until it fits.
  for (const side of [1800, 1500, 1280, 1080, 900, 760]) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    ctx.fillStyle = "#fff"; // PNG transparency becomes white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.72, 0.6, 0.5, 0.42]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (blob && blob.size <= MAX_UPLOAD_BYTES) {
        bitmap.close();
        return { file: new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }), shrunk: true };
      }
    }
  }
  bitmap.close();
  return { error: "This photo is too detailed to fit 200 KB. Crop it closer to the document and try again." };
}

/** Puts the (possibly shrunk) file back into the input, so the form sends it. */
export function replaceInputFile(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
}

export const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
