import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  MessageCircle,
  Printer,
  Search,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { fmtDate, useClasses, useDebounced } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/store/auth";
import { Defaulter, ReminderDialog } from "./ReminderDialog";
import { fmtMoney } from "./shared";

interface Row extends Defaulter {
  fatherName: string;
  className: string | null;
  section: string | null;
  totalFee: string;
  paid: string;
  overdueMonths: number;
  oldestPeriod: string;
  lastPaymentDate: string | null;
  lastReminderAt: string | null;
  reminderCount: number;
}
interface Paged {
  items: Row[];
  total: number;
  totalOutstanding: string;
  page: number;
  pageSize: number;
}
interface SectionOption {
  id: string;
  name: string;
}

const monthShort = (k: string) =>
  new Date(`${k}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export default function DefaultersPage() {
  const can = useAuth((s) => s.can);
  const { user } = useAuth();

  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [periodKey, setPeriodKey] = useState("");
  const [minOutstanding, setMin] = useState("");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("outstanding");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [remind, setRemind] = useState<Defaulter[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const dq = useDebounced(q);
  const dmin = useDebounced(minOutstanding);
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
      setPicked(new Set());
    };

  const classes = useClasses();
  const sections = useQuery({
    queryKey: ["/academics/sections", classId],
    enabled: !!classId,
    queryFn: async () =>
      (
        await api.get<{ data: SectionOption[] }>("/academics/sections", {
          params: { classId },
        })
      ).data.data,
  });

  const filters = {
    sessionId: sessionId || undefined,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
    periodKey: periodKey || undefined,
    minOutstanding: dmin || undefined,
    q: dq || undefined,
    sortBy,
  };
  const params = { ...filters, page, pageSize: 20 };
  const list = useQuery({
    queryKey: ["fees", "defaulters", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/fees/defaulters", { params })).data
        .data,
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const allOnPage =
    !!data?.items.length && data.items.every((r) => picked.has(r.studentId));

  const exportXlsx = async () => {
    setExporting(true);
    try {
      await downloadFile(
        "/fees/defaulters/export",
        filters,
        "fee-defaulters.xlsx",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const selectedRows = data?.items.filter((r) => picked.has(r.studentId)) ?? [];

  return (
    <>
      <PageHeader
        title="Fee Defaulter List"
        subtitle="Students with unpaid invoices past their due date."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            {can("fees", "EDIT") && (
              <button
                className="btn border border-emerald-600 text-emerald-700 disabled:opacity-40"
                disabled={selectedRows.length === 0}
                onClick={() => setRemind(selectedRows)}
              >
                <MessageCircle size={16} />
                Send reminders
                {selectedRows.length ? ` (${selectedRows.length})` : ""}
              </button>
            )}
            <button
              className="btn border border-slate-300"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              Print
            </button>
            {can("fees", "EXPORT") && (
              <button
                className="btn-primary"
                onClick={exportXlsx}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={16} />
                )}
                Export Excel
              </button>
            )}
          </div>
        }
      />

      <div className="no-print mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-500">Defaulters</p>
          <p className="mt-1 text-2xl font-extrabold text-ink-950">
            {data ? data.total : "—"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-500">
            Total outstanding
          </p>
          <p className="mt-1 text-2xl font-extrabold text-rose-600">
            {data ? fmtMoney(data.totalOutstanding) : "—"}
          </p>
        </div>
      </div>

      <div className="no-print card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Name or admission no"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={sessionId}
          onChange={(e) => reset(setSessionId)(e.target.value)}
          aria-label="Session"
        >
          <option value="">All sessions</option>
          {user?.sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setSectionId("");
            setPage(1);
            setPicked(new Set());
          }}
          aria-label="Class"
        >
          <option value="">All classes</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={sectionId}
          disabled={!classId}
          onChange={(e) => reset(setSectionId)(e.target.value)}
          aria-label="Section"
        >
          <option value="">{classId ? "All sections" : "Pick a class"}</option>
          {sections.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="text-xs font-semibold text-slate-500">
          Overdue for month
          <input
            type="month"
            className="input mt-1 font-normal"
            value={periodKey}
            onChange={(e) => reset(setPeriodKey)(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Outstanding above (Rs)
          <input
            type="number"
            min="0"
            className="input mt-1 font-normal"
            placeholder="0"
            value={minOutstanding}
            onChange={(e) => reset(setMin)(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Sort by
          <select
            className="input mt-1 font-normal"
            value={sortBy}
            onChange={(e) => reset(setSortBy)(e.target.value)}
          >
            <option value="outstanding">Highest outstanding</option>
            <option value="oldest">Oldest overdue</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <p className="hidden text-sm print:block">
        Fee defaulters as of {new Date().toLocaleDateString()}.{" "}
        {data?.total ?? 0} students, outstanding{" "}
        {data ? fmtMoney(data.totalOutstanding) : ""}.
      </p>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="no-print px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={allOnPage}
                  aria-label="Select all on this page"
                  onChange={() =>
                    setPicked(
                      allOnPage
                        ? new Set()
                        : new Set(data!.items.map((r) => r.studentId)),
                    )
                  }
                />
              </th>
              {[
                "Student",
                "Class",
                "Parent contact",
                "Total fee",
                "Paid",
                "Outstanding",
                "Overdue",
                "Last payment",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th className="no-print px-4 py-3">Reminded</th>
              <th className="no-print px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center">
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
                  colSpan={11}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load defaulters")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No defaulters match these filters.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr
                key={r.studentId}
                className="border-b border-line last:border-0 hover:bg-slate-50/60"
              >
                <td className="no-print px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label={`Select ${r.fullName}`}
                    checked={picked.has(r.studentId)}
                    onChange={(e) =>
                      setPicked((p) => {
                        const n = new Set(p);
                        e.target.checked
                          ? n.add(r.studentId)
                          : n.delete(r.studentId);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/students/view/${r.studentId}`}
                    className="font-semibold hover:text-brand-700"
                  >
                    {r.fullName}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {r.admissionNo}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.className ? `${r.className} / ${r.section}` : "—"}
                </td>
                <td className="px-4 py-3">
                  {r.guardianName ?? "—"}
                  <span className="block text-xs text-slate-500">
                    {r.guardianPhone ?? ""}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtMoney(r.totalFee)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {fmtMoney(r.paid)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-rose-600">
                  {fmtMoney(r.outstanding)}
                </td>
                <td
                  className="px-4 py-3"
                  title={r.months.map(monthShort).join(", ")}
                >
                  {r.overdueMonths} month{r.overdueMonths === 1 ? "" : "s"}
                  <span className="block text-xs text-slate-500">
                    since {monthShort(r.oldestPeriod)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.lastPaymentDate ? fmtDate(r.lastPaymentDate) : "Never"}
                </td>
                <td className="no-print whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {r.lastReminderAt
                    ? `${fmtDate(r.lastReminderAt)} (${r.reminderCount})`
                    : "—"}
                </td>
                <td className="no-print px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    {can("fees", "EDIT") && (
                      <button
                        className="rounded-md p-2 text-emerald-600 hover:bg-emerald-50"
                        onClick={() => setRemind([r])}
                        aria-label={`Remind ${r.fullName}`}
                      >
                        <MessageCircle size={16} />
                      </button>
                    )}
                    {can("fee_collection", "CREATE") && (
                      <Link
                        to={`/fees/collection?studentId=${r.studentId}`}
                        className="rounded-md p-2 text-brand-700 hover:bg-brand-50"
                        aria-label={`Collect from ${r.fullName}`}
                      >
                        <Wallet size={16} />
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.total > 0 && (
          <div className="no-print flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-600">
            <span>
              Showing {(data.page - 1) * data.pageSize + 1}–
              {Math.min(data.page * data.pageSize, data.total)} of {data.total}.
              Print and Export include only this filter, Export includes every
              page.
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

      {remind && (
        <ReminderDialog items={remind} onClose={() => setRemind(null)} />
      )}
    </>
  );
}
