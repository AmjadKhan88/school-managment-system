import type { AxiosError } from "axios";
import { api } from "./api";

/** Downloads a file from an authenticated endpoint. Throws an Error with a readable message on failure. */
export async function downloadFile(
  url: string,
  params: Record<string, unknown>,
  fallbackName: string,
) {
  try {
    const res = await api.get<Blob>(url, { params, responseType: "blob" });
    const disposition = String(res.headers["content-disposition"] ?? "");
    const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
    const href = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  } catch (e) {
    // A failed blob request hides the JSON error inside the blob, so read it back out.
    const blob = (e as AxiosError).response?.data;
    if (blob instanceof Blob) {
      try {
        throw new Error(
          JSON.parse(await blob.text()).message ?? "Download failed",
        );
      } catch (inner) {
        throw inner instanceof Error ? inner : new Error("Download failed");
      }
    }
    throw e instanceof Error ? e : new Error("Download failed");
  }
}
