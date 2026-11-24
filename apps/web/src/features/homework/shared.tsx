import { Paperclip, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

export type Track =
  | "PENDING"
  | "OVERDUE"
  | "SUBMITTED"
  | "LATE"
  | "CHECKED"
  | "REDO";
export const TRACK: Record<Track, [string, string]> = {
  PENDING: ["Not submitted", "bg-slate-100 text-slate-600"],
  OVERDUE: ["Overdue", "bg-rose-100 text-rose-700"],
  SUBMITTED: ["Submitted", "bg-sky-100 text-sky-700"],
  LATE: ["Submitted late", "bg-amber-100 text-amber-700"],
  CHECKED: ["Checked", "bg-emerald-100 text-emerald-700"],
  REDO: ["Redo needed", "bg-orange-100 text-orange-700"],
};
export const fmtSize = (n: number) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;
export const ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
export const MAX_FILES = 5;

/** Opens a protected file in a new tab (the file needs the sign-in token, so a plain link would not work). */
export async function openFile(url: string, params?: Record<string, string>) {
  try {
    const res = await api.get<Blob>(url, { params, responseType: "blob" });
    const u = URL.createObjectURL(res.data);
    window.open(u, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
  } catch {
    toast.error("Could not open the file");
  }
}

export function FilePicker({
  files,
  onChange,
  max = MAX_FILES,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  max?: number;
}) {
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    if (next.length > max) {
      toast.error(`At most ${max} files`);
      return;
    }
    const big = next.find((f) => f.size > 5 * 1024 * 1024);
    if (big) {
      toast.error(`${big.name} is larger than 5 MB`);
      return;
    }
    onChange(next);
  };
  return (
    <div>
      <ul className="space-y-1">
        {files.map((f, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm"
          >
            <span className="truncate">
              {f.name}{" "}
              <span className="text-xs text-slate-400">{fmtSize(f.size)}</span>
            </span>
            <button
              type="button"
              className="text-slate-500 hover:text-slate-800"
              aria-label={`Remove ${f.name}`}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      {files.length < max && (
        <label className="btn mt-1 cursor-pointer border border-slate-300 py-1.5">
          <Paperclip size={15} />
          Attach files
          <input
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}
      <p className="mt-1 text-xs text-slate-500">
        PDF, JPG, PNG or WebP. Up to {max} files, 5 MB each.
      </p>
    </div>
  );
}
