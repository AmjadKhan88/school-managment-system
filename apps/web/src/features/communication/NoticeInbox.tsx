import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Pin } from "lucide-react";
import { useState } from "react";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { KIND_LABEL, KIND_STYLE } from "./shared";

interface Item {
  id: string;
  noticeNo: string;
  kind: string;
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: string | null;
  expiresOn: string | null;
  read: boolean;
}
interface Paged {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}

export function NoticeInbox() {
  const qc = useQueryClient();
  const [kind, setKind] = useState("");
  const [unread, setUnread] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const params = {
    kind: kind || undefined,
    unread: unread ? "yes" : undefined,
    page,
    pageSize: 10,
  };
  const q = useQuery({
    queryKey: ["notices", "mine", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/notices/mine", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const read = useMutation({
    mutationFn: (id: string) => api.post(`/notices/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notices"] }),
  });
  const d = q.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;

  const toggle = (n: Item) => {
    const opening = open !== n.id;
    setOpen(opening ? n.id : null);
    if (opening && !n.read) read.mutate(n.id);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          ["", "All"],
          ["NOTICE", "Notices"],
          ["CIRCULAR", "Circulars"],
          ["ANNOUNCEMENT", "Announcements"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setPage(1);
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-semibold",
              kind === k
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-500",
            )}
          >
            {l}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={unread}
            onChange={(e) => {
              setUnread(e.target.checked);
              setPage(1);
            }}
          />
          Unread only
        </label>
      </div>

      {q.isLoading && (
        <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
      )}
      {q.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(q.error, "Could not load")}
        </div>
      )}
      {d?.items.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          {unread
            ? "You have read everything."
            : "No notices for you right now."}
        </div>
      )}

      <div className="grid gap-3">
        {d?.items.map((n) => (
          <article
            key={n.id}
            className={cn(
              "card p-4",
              !n.read && "border-l-4 border-l-brand-500",
            )}
          >
            <button
              className="w-full text-left"
              onClick={() => toggle(n)}
              aria-expanded={open === n.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    KIND_STYLE[n.kind],
                  )}
                >
                  {KIND_LABEL[n.kind]}
                </span>
                {n.isPinned && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                    <Pin size={12} />
                    Pinned
                  </span>
                )}
                {!n.read && (
                  <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">
                    New
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-500">
                  {n.publishedAt ? fmtDate(n.publishedAt) : ""}
                </span>
              </div>
              <h3 className="mt-2 text-base font-bold text-ink-950">
                {n.title}
              </h3>
              {open !== n.id && (
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {n.body}
                </p>
              )}
            </button>
            {open === n.id && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {n.body}
              </p>
            )}
            {open === n.id && (
              <p className="mt-3 text-xs text-slate-400">
                {n.noticeNo}
                {n.expiresOn ? ` · shown until ${fmtDate(n.expiresOn)}` : ""}
              </p>
            )}
          </article>
        ))}
      </div>

      {d && d.total > d.pageSize && (
        <div className="mt-4 flex items-center justify-center gap-1 text-sm text-slate-600">
          <button
            className="rounded-md p-2 hover:bg-slate-100 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-2">
            Page {page} of {pages}
          </span>
          <button
            className="rounded-md p-2 hover:bg-slate-100 disabled:opacity-40"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}
