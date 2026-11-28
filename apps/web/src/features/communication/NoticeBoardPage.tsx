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
  Pencil,
  Pin,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Field, fmtDate, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import {
  AUDIENCE_LABEL,
  KIND_LABEL,
  STATUS_STYLE,
  useNoticeClasses,
} from "./shared";

type Kind = "NOTICE" | "CIRCULAR" | "ANNOUNCEMENT";
interface Notice {
  id: string;
  noticeNo: string;
  kind: Kind;
  title: string;
  body: string;
  audience: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isPinned: boolean;
  publishedAt: string | null;
  expiresOn: string | null;
  archiveReason: string | null;
  classes: { id: string; name: string }[];
  reads: number;
}
interface Paged {
  items: Notice[];
  total: number;
  page: number;
  pageSize: number;
}

const TITLES: Record<Kind, [string, string]> = {
  NOTICE: ["Notices", "Short notices for parents, students and staff."],
  CIRCULAR: ["Circulars", "Formal circulars issued by the school."],
  ANNOUNCEMENT: ["Announcements", "News and events for the school community."],
};

export default function NoticeBoardPage({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Notice | "new" | null>(null);
  const dq = useDebounced(q);

  const params = {
    kind,
    q: dq || undefined,
    status: status || undefined,
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ["communication", "notices", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/communication/notices", { params }))
        .data.data,
    placeholderData: keepPreviousData,
  });
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["communication"] });
    qc.invalidateQueries({ queryKey: ["notices"] });
  };

  const act = useMutation({
    mutationFn: (v: {
      id: string;
      action: "publish" | "archive" | "delete";
      reason?: string;
    }) =>
      v.action === "delete"
        ? api.delete(`/communication/notices/${v.id}`)
        : api.post(`/communication/notices/${v.id}/${v.action}`, {
            reason: v.reason,
          }),
    onSuccess: (_r, v) => {
      toast.success(
        v.action === "publish"
          ? "Published"
          : v.action === "archive"
            ? "Archived"
            : "Deleted",
      );
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const archive = (n: Notice) => {
    const reason = window.prompt(
      `Archive "${n.title}"? It will disappear from everyone's board. Reason (optional):`,
    );
    if (reason !== null)
      act.mutate({
        id: n.id,
        action: "archive",
        reason: reason.trim() || undefined,
      });
  };

  return (
    <>
      <PageHeader
        title={TITLES[kind][0]}
        subtitle={TITLES[kind][1]}
        actions={
          can("communication", "CREATE") && (
            <button className="btn-primary" onClick={() => setDialog("new")}>
              <Plus size={16} />
              New {KIND_LABEL[kind].toLowerCase()}
            </button>
          )
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Title, number or text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Drafts</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {["Title", "For", "Status", "Published", "Read by"].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <Loader2
                    className="mx-auto animate-spin text-slate-400"
                    size={18}
                  />
                </td>
              </tr>
            )}
            {list.isError && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load")}
                </td>
              </tr>
            )}
            {d?.items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  Nothing here yet.
                </td>
              </tr>
            )}
            {d?.items.map((n) => (
              <tr key={n.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <span className="font-semibold">
                    {n.isPinned && (
                      <Pin size={13} className="mr-1 inline text-brand-600" />
                    )}
                    {n.title}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {n.noticeNo}
                    {n.expiresOn ? ` · expires ${fmtDate(n.expiresOn)}` : ""}
                    {n.archiveReason ? ` · ${n.archiveReason}` : ""}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {AUDIENCE_LABEL[n.audience]}
                  {n.audience === "CLASS" && (
                    <span className="block text-xs text-slate-500">
                      {n.classes.map((c) => c.name).join(", ")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      STATUS_STYLE[n.status][1],
                    )}
                  >
                    {STATUS_STYLE[n.status][0]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {n.publishedAt ? fmtDate(n.publishedAt) : "—"}
                </td>
                <td className="px-4 py-3">
                  {n.status === "DRAFT" ? "—" : n.reads}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    {n.status === "DRAFT" &&
                      can("communication", "APPROVE") && (
                        <button
                          className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          disabled={act.isPending}
                          onClick={() =>
                            act.mutate({ id: n.id, action: "publish" })
                          }
                        >
                          Publish
                        </button>
                      )}
                    {n.status === "PUBLISHED" &&
                      can("communication", "APPROVE") && (
                        <button
                          className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          onClick={() => archive(n)}
                        >
                          Archive
                        </button>
                      )}
                    {n.status !== "ARCHIVED" &&
                      can("communication", "EDIT") && (
                        <button
                          className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                          onClick={() => setDialog(n)}
                          aria-label={`Edit ${n.title}`}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                    {n.status === "DRAFT" && can("communication", "DELETE") && (
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        onClick={() =>
                          window.confirm(`Delete the draft "${n.title}"?`) &&
                          act.mutate({ id: n.id, action: "delete" })
                        }
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d && d.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-600">
            <span>
              Showing {(d.page - 1) * d.pageSize + 1}–
              {Math.min(d.page * d.pageSize, d.total)} of {d.total}
            </span>
            <div className="flex items-center gap-1">
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
          </div>
        )}
      </div>

      {dialog && (
        <NoticeDialog
          kind={kind}
          notice={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function NoticeDialog({
  kind,
  notice,
  onClose,
  onSaved,
}: {
  kind: Kind;
  notice: Notice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const can = useAuth((s) => s.can);
  const classes = useNoticeClasses();
  const [f, setF] = useState({
    title: notice?.title ?? "",
    body: notice?.body ?? "",
    audience: notice?.audience ?? "ALL",
    classIds: notice?.classes.map((c) => c.id) ?? ([] as string[]),
    expiresOn: notice?.expiresOn?.slice(0, 10) ?? "",
    isPinned: notice?.isPinned ?? false,
  });
  const [alsoPublish, setAlsoPublish] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        kind,
        ...f,
        expiresOn: f.expiresOn || undefined,
        classIds: f.audience === "CLASS" ? f.classIds : [],
      };
      const r = notice
        ? await api.put<{ data: { id: string } }>(
            `/communication/notices/${notice.id}`,
            body,
          )
        : await api.post<{ data: { id: string } }>(
            "/communication/notices",
            body,
          );
      if (alsoPublish)
        await api.post(`/communication/notices/${r.data.data.id}/publish`);
    },
    onSuccess: () => {
      toast.success(
        alsoPublish
          ? "Saved and published"
          : notice
            ? "Saved"
            : "Saved as a draft",
      );
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const toggle = (id: string) =>
    setF((s) => ({
      ...s,
      classIds: s.classIds.includes(id)
        ? s.classIds.filter((x) => x !== id)
        : [...s.classIds, id],
    }));
  const canPublish =
    can("communication", "APPROVE") && (!notice || notice.status === "DRAFT");

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="card w-full max-w-xl p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {notice ? "Edit" : "New"} {KIND_LABEL[kind].toLowerCase()}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Title *">
            <input
              required
              className="input mt-1.5 font-normal"
              maxLength={150}
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </Field>
          <Field label="Message *">
            <textarea
              required
              rows={6}
              maxLength={5000}
              className="input mt-1.5 font-normal"
              value={f.body}
              onChange={(e) => setF({ ...f, body: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who should see it *">
              <select
                className="input mt-1.5 font-normal"
                value={f.audience}
                onChange={(e) => setF({ ...f, audience: e.target.value })}
              >
                {Object.entries(AUDIENCE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hide after (optional)">
              <input
                type="date"
                className="input mt-1.5 font-normal"
                value={f.expiresOn}
                onChange={(e) => setF({ ...f, expiresOn: e.target.value })}
              />
            </Field>
          </div>
          {f.audience === "CLASS" && (
            <fieldset>
              <legend className="text-sm font-semibold">
                Classes (parents and students of these classes) *
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {classes.data?.map((c) => (
                  <label
                    key={c.id}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold",
                      f.classIds.includes(c.id)
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-500",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={f.classIds.includes(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={f.isPinned}
              onChange={(e) => setF({ ...f, isPinned: e.target.checked })}
            />
            Pin to the top of the board
          </label>
          {canPublish && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={alsoPublish}
                onChange={(e) => setAlsoPublish(e.target.checked)}
              />
              Publish now (visible to the chosen people straight away)
            </label>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="btn border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            {alsoPublish ? "Save and publish" : notice ? "Save" : "Save draft"}
          </button>
        </div>
      </form>
    </div>
  );
}
