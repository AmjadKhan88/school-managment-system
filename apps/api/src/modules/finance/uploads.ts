import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_EXPENSE = 5;
export const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "expenses");

const jpeg = (b: Buffer) =>
  b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const ALLOWED: Record<
  string,
  { mimes: string[]; magic: (b: Buffer) => boolean }
> = {
  pdf: {
    mimes: ["application/pdf"],
    magic: (b) => b.subarray(0, 4).toString("latin1") === "%PDF",
  },
  jpg: { mimes: ["image/jpeg"], magic: jpeg },
  jpeg: { mimes: ["image/jpeg"], magic: jpeg },
  png: {
    mimes: ["image/png"],
    magic: (b) =>
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  webp: {
    mimes: ["image/webp"],
    magic: (b) =>
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
};

/** Checks the extension, the declared type AND the file's real first bytes. Nothing is written to disk before this passes. */
export function validateUpload(file: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}): { ext: string } | { error: string } {
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule) return { error: "Only PDF, JPG, PNG or WebP files are allowed" };
  if (!rule.mimes.includes(file.mimetype))
    return { error: "The file type does not match its extension" };
  if (!rule.magic(file.buffer))
    return { error: "The file content is not a valid " + ext.toUpperCase() };
  return { ext };
}

/** Browsers send file names as latin1 bytes; restore the real UTF-8 name for display. */
export const displayName = (original: string) =>
  Buffer.from(original, "latin1").toString("utf8").slice(0, 150);

export async function saveUpload(buffer: Buffer, ext: string) {
  await fs.promises.mkdir(UPLOAD_ROOT, { recursive: true });
  const storedName = `${randomUUID()}.${ext}`; // the user's file name never touches the path
  await fs.promises.writeFile(path.join(UPLOAD_ROOT, storedName), buffer, {
    flag: "wx",
  });
  return storedName;
}

export const uploadPath = (storedName: string) =>
  path.join(UPLOAD_ROOT, path.basename(storedName));

export async function removeUpload(storedName: string) {
  try {
    await fs.promises.unlink(uploadPath(storedName));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
