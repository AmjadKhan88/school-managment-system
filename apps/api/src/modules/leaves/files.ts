import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export const LEAVE_ROOT = path.resolve(process.cwd(), "uploads", "leave");

export async function saveLeaveFile(buffer: Buffer, ext: string) {
  await fs.promises.mkdir(LEAVE_ROOT, { recursive: true });
  const storedName = `${randomUUID()}.${ext}`; // the user's file name never touches the path
  await fs.promises.writeFile(path.join(LEAVE_ROOT, storedName), buffer, {
    flag: "wx",
  });
  return storedName;
}

export const leaveFilePath = (storedName: string) =>
  path.join(LEAVE_ROOT, path.basename(storedName));

export async function removeLeaveFile(storedName: string) {
  try {
    await fs.promises.unlink(leaveFilePath(storedName));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
