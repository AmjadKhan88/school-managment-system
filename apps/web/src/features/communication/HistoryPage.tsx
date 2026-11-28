import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageCircle,
  RotateCw,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { waLink } from "@/features/library/shared";
import { fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import {
  CHANNEL_LABEL,
  Channel,
  STATUS_STYLE,
  useChannelStatus,
} from "./messaging";

interface Batch {
  id: string;
  batchNo: string;
  channel: Channel;
  purpose: string;
  audienceLabel: string;
  subject: string | null;
  body: string;
  total: number;
  skipped: number;
  createdAt: string;
  counts: Record<string, number>;
}
interface Log {
  id: string;
  recipientName: string;
  to: string;
  channel: Channel;
  body: string;
  status: string;
  error: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
}

export default function HistoryPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [sp, setSp] = useSearchParams();
  const open = sp.get("batch");
  const [channel, setChannel] = useState("");
  const [page, setPage] = useState(1);
  const status = useChannelStatus();

  const params = { channel: channel || undefined, page, pageSize: 15 };
  const list = useQuery({
    queryKey: ["communication", "batches", params],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<{
          data: {
            items: Batch[];
            total: number;
            page: number;
            pageSize: number;
          };
        }>("/communication/messages/batches", { params })
      ).data.data,
    refetchInterval: (q) =>
      q.state.data?.items.some((b) => (b.counts.QUEUED ?? 0) > 0)
        ? 4000
        : false, // while messages are still going out
  });
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;

  const retry = useMutation({
    mutationFn: (id: string) =>
      api.post(`/communication/messages/batches/${id}/retry`),
    onSuccess: () => {
      toast.success("Retrying");
      qc.invalidateQueries({ queryKey: ["communication"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <>
      <PageHeader
        title="Notification History"
        subtitle="Every WhatsApp, SMS and email sent from the system, with its delivery status."
        actions={
          <select
            className="input w-40"
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value);
              setPage(1);
            }}
            aria-label="Channel"
          >
            <option value="">All channels</option>
            {(["WHATSAPP", "SMS", "EMAIL"] as Channel[]).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        }
      />
      {status.data && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold">
          {(["WHATSAPP", "SMS", "EMAIL"] as Channel[]).map((c) => (
            <span
              key={c}
              className={cn(
                "rounded-full px-3 py-1",
                status.data![c]
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-200 text-slate-600",
              )}
            >
              {CHANNEL_LABEL[c]}:{" "}
              {status.data![c]
                ? "connected"
                : c === "WHATSAPP"
                  ? "manual mode"
                  : "not set up"}
            </span>
          ))}
        </div>
      )}

      {list.isLoading && (
        <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
      )}
      {list.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(list.error, "Could not load")}
        </div>
      )}
      {d?.items.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Nothing has been sent yet.
        </div>
      )}

      <div className="grid gap-3">
        {d?.items.map((b) => {
          const redo = (b.counts.FAILED ?? 0) + (b.counts.QUEUED ?? 0);
          return (
            <article key={b.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  className="text-left"
                  onClick={() => setSp(open === b.id ? {} : { batch: b.id })}
                >
                  <p className="font-bold text-ink-950">
                    {b.batchNo} · {CHANNEL_LABEL[b.channel]} · {b.audienceLabel}
                    {b.purpose === "FEE_REMINDER" && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        Fee reminder
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmtDate(b.createdAt)} · {b.total} message
                    {b.total === 1 ? "" : "s"}
                    {b.skipped > 0 ? ` · ${b.skipped} skipped` : ""}
                  </p>
                  <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                    {b.subject ? `${b.subject}: ` : ""}
                    {b.body}
                  </p>
                </button>
                <div className="flex flex-wrap items-center gap-1.5">
                  {Object.entries(b.counts).map(([s, n]) => (
                    <span
                      key={s}
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        STATUS_STYLE[s][1],
                      )}
                    >
                      {n} {STATUS_STYLE[s][0].toLowerCase()}
                    </span>
                  ))}
                  {redo > 0 &&
                    can("communication", "CREATE") &&
                    b.channel !== "WHATSAPP" && (
                      <button
                        className="btn border border-slate-300 py-1"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(b.id)}
                      >
                        <RotateCw size={14} />
                        Retry {redo}
                      </button>
                    )}
                  {redo > 0 &&
                    can("communication", "CREATE") &&
                    b.channel === "WHATSAPP" &&
                    status.data?.WHATSAPP && (
                      <button
                        className="btn border border-slate-300 py-1"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(b.id)}
                      >
                        <RotateCw size={14} />
                        Retry {redo}
                      </button>
                    )}
                </div>
              </div>
              {open === b.id && <Logs batchId={b.id} />}
            </article>
          );
        })}
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

function Logs({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const params = { status: status || undefined, page, pageSize: 25 };
  const q = useQuery({
    queryKey: ["communication", "logs", batchId, params],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<{
          data: { items: Log[]; total: number; page: number; pageSize: number };
        }>(`/communication/messages/batches/${batchId}/logs`, { params })
      ).data.data,
  });
  const mark = useMutation({
    mutationFn: (id: string) =>
      api.post(`/communication/messages/logs/${id}/mark-sent`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communication"] }),
    onError: (e) => toast.error(apiMessage(e)),
  });
  const d = q.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <select
        className="input mb-3 w-44"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
        aria-label="Status"
      >
        <option value="">All statuses</option>
        {Object.entries(STATUS_STYLE).map(([k, v]) => (
          <option key={k} value={k}>
            {v[0]}
          </option>
        ))}
      </select>
      {q.isLoading && (
        <Loader2 className="animate-spin text-slate-400" size={18} />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="py-2 pr-3">Recipient</th>
              <th className="pr-3">To</th>
              <th className="pr-3">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d?.items.map((l) => (
              <tr key={l.id} className="border-t border-line align-top">
                <td className="py-2 pr-3">{l.recipientName}</td>
                <td className="pr-3 font-mono text-xs">{l.to}</td>
                <td className="pr-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      STATUS_STYLE[l.status][1],
                    )}
                  >
                    {STATUS_STYLE[l.status][0]}
                  </span>
                  {l.error && (
                    <span className="block max-w-xs text-xs text-rose-600">
                      {l.error}
                    </span>
                  )}
                  {(l.readAt || l.deliveredAt || l.sentAt) && (
                    <span className="block text-xs text-slate-400">
                      {fmtDate((l.readAt ?? l.deliveredAt ?? l.sentAt)!)}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {l.status === "MANUAL" && l.channel === "WHATSAPP" && (
                    <div className="inline-flex gap-1">
                      <a
                        href={waLink(l.to, l.body) ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <MessageCircle size={14} />
                        Open WhatsApp
                      </a>
                      {can("communication", "CREATE") && (
                        <button
                          className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          onClick={() => mark.mutate(l.id)}
                        >
                          Mark sent
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d && d.total > d.pageSize && (
        <div className="mt-2 flex items-center justify-end gap-1 text-xs text-slate-600">
          <button
            className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
