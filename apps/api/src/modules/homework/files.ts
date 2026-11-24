import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError } from "../../utils/ApiError";
import { MAX_BYTES } from "../finance/uploads";

export const HOMEWORK_ROOT = path.resolve(process.cwd(), "uploads", "homework");
export const SUBMISSION_ROOT = path.resolve(
  process.cwd(),
  "uploads",
  "submissions",
);
export const MAX_FILES = 5;

export async function saveTo(root: string, buffer: Buffer, ext: string) {
  await fs.promises.mkdir(root, { recursive: true });
  const storedName = `${randomUUID()}.${ext}`; // the user's file name never touches the path
  await fs.promises.writeFile(path.join(root, storedName), buffer, {
    flag: "wx",
  });
  return storedName;
}
export const pathIn = (root: string, storedName: string) =>
  path.join(root, path.basename(storedName));
export async function removeFrom(root: string, storedName: string) {
  try {
    await fs.promises.unlink(pathIn(root, storedName));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: MAX_FILES },
});
export const receiveFiles = (req: Request, res: Response, next: NextFunction) =>
  upload.array("files", MAX_FILES)(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    next(
      ApiError.badRequest(
        code === "LIMIT_FILE_SIZE"
          ? "A file is too large (5 MB maximum each)"
          : code === "LIMIT_UNEXPECTED_FILE" || code === "LIMIT_FILE_COUNT"
            ? `At most ${MAX_FILES} files`
            : "The upload failed",
      ),
    );
  });
