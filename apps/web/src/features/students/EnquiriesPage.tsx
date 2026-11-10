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
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import {
  clean,
  EnquiryStatus,
  Field,
  fmtDate,
  isoDate,
  STATUS_LABEL,
  StatusBadge,
  todayIso,
  useClasses,
  useDebounced,
} from "./shared";

interface Enquiry {
  id: string;
  enquiryNo: string;
  studentName: string;
  fatherName: string;
  phone: string;
  email: string | null;
  dateOfBirth: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  interestedClassId: string | null;
  interestedClass: { id: string; name: string } | null;
  previousSchool: string | null;
  address: string | null;
  enquiryDate: string;
  source: string | null;
  remarks: string | null;
  followUpDate: string | null;
  status: EnquiryStatus;
}
interface Paged {
  items: Enquiry[];
  total: number;
  page: number;
  pageSize: number;
}
interface Stats {
  total: number;
  byStatus: Record<string, number>;
  followUpsDue: number;
  conversionRate: number;
}

const OPEN_STATUSES: EnquiryStatus[] = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "ADMISSION_PENDING",
  "REJECTED",
];
const PAGE_SIZE = 15;

const EMPTY = {
  studentName: "",
  fatherName: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  gender: "",
  interestedClassId: "",
  previousSchool: "",
  address: "",
  enquiryDate: todayIso(),
  source: "",
  remarks: "",
  followUpDate: "",
};
type Form = typeof EMPTY;

export default function EnquiriesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const can = useAuth((s) => s.can);
  const classes = useClasses();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  const [editing, setEditing] = useState<Enquiry | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  const params = {
    q: dq || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const list = useQuery({
    queryKey: ["enquiries", "list", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/enquiries", { params })).data.data,
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({
    queryKey: ["enquiries", "stats"],
    queryFn: async () =>
      (await api.get<{ data: Stats }>("/enquiries/stats")).data.data,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["enquiries"] });

  const save = useMutation({
    mutationFn: () => {
      const payload = clean(form);
      return editing === "new"
        ? api.post("/enquiries", payload)
        : api.put(`/enquiries/${(editing as Enquiry).id}`, payload);
    },
    onSuccess: () => {
      toast.success("Enquiry saved");
      setEditing(null);
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const changeStatus = useMutation({
    mutationFn: (v: { id: string; status: EnquiryStatus }) =>
      api.patch(`/enquiries/${v.id}/status`, { status: v.status }),
    onSuccess: () => {
      toast.success("Status updated");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/enquiries/${id}`),
    onSuccess: () => {
      toast.success("Enquiry deleted");
      refresh();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const open = (row: Enquiry | "new") => {
    setForm(
      row === "new"
        ? { ...EMPTY, enquiryDate: todayIso() }
        : {
            studentName: row.studentName,
            fatherName: row.fatherName,
            phone: row.phone,
            email: row.email ?? "",
            dateOfBirth: isoDate(row.dateOfBirth),
            gender: row.gender ?? "",
            interestedClassId: row.interestedClassId ?? "",
            previousSchool: row.previousSchool ?? "",
            address: row.address ?? "",
            enquiryDate: isoDate(row.enquiryDate),
            source: row.source ?? "",
            remarks: row.remarks ?? "",
            followUpDate: isoDate(row.followUpDate),
          },
    );
    setEditing(row);
  };

  const set =
    (k: keyof Form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const s = stats.data;
  const cards = [
    { label: "Total enquiries", value: s?.total ?? "—" },
    { label: "Follow-ups due", value: s?.followUpsDue ?? "—" },
    { label: "Admitted", value: s?.byStatus.ADMITTED ?? 0 },
    { label: "Conversion rate", value: s ? `${s.conversionRate}%` : "—" },
  ];

  return (
    <>
      <PageHeader
        title="Admission Enquiry"
        subtitle="Track enquiries, schedule follow-ups and convert them into admissions."
        actions={
          can("enquiries", "CREATE") && (
            <button className="btn-primary" onClick={() => open("new")}>
              <Plus size={16} />
              New enquiry
            </button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-xs font-semibold text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-extrabold text-ink-950">
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Search name, phone, enquiry no"
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
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as EnquiryStatus[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          aria-label="From date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <input
          type="date"
          className="input"
          aria-label="To date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {[
                "Enquiry no",
                "Student",
                "Father",
                "Phone",
                "Class",
                "Date",
                "Follow-up",
                "Status",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center">
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
                  colSpan={9}
                  className="px-4 py-10 text-center text-rose-600"
                >
                  {apiMessage(list.error, "Could not load enquiries")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No enquiries match these filters.
                </td>
              </tr>
            )}
            {data?.items.map((r) => {
              const locked = r.status === "ADMITTED";
              return (
                <tr
                  key={r.id}
                  className="border-b border-line last:border-0 hover:bg-slate-50/60"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">
                    {r.enquiryNo}
                  </td>
                  <td className="px-4 py-3">{r.studentName}</td>
                  <td className="px-4 py-3">{r.fatherName}</td>
                  <td className="whitespace-nowrap px-4 py-3">{r.phone}</td>
                  <td className="px-4 py-3">
                    {r.interestedClass?.name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {fmtDate(r.enquiryDate)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {fmtDate(r.followUpDate)}
                  </td>
                  <td className="px-4 py-3">
                    {locked || !can("enquiries", "EDIT") ? (
                      <StatusBadge status={r.status} />
                    ) : (
                      <select
                        aria-label="Change status"
                        value={r.status}
                        onChange={(e) =>
                          changeStatus.mutate({
                            id: r.id,
                            status: e.target.value as EnquiryStatus,
                          })
                        }
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
                      >
                        {OPEN_STATUSES.map((k) => (
                          <option key={k} value={k}>
                            {STATUS_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      {!locked &&
                        r.status !== "REJECTED" &&
                        can("admissions", "CREATE") && (
                          <button
                            onClick={() =>
                              navigate(
                                `/students/new-admission?enquiryId=${r.id}`,
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                          >
                            <UserPlus size={14} />
                            Admit
                          </button>
                        )}
                      {!locked && can("enquiries", "EDIT") && (
                        <button
                          onClick={() => open(r)}
                          className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                          aria-label="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {!locked && can("enquiries", "DELETE") && (
                        <button
                          onClick={() =>
                            window.confirm("Delete this enquiry?") &&
                            remove.mutate(r.id)
                          }
                          className="rounded-md p-2 text-rose-500 hover:bg-rose-50"
                          aria-label="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-600">
            <span>
              Showing {(data.page - 1) * data.pageSize + 1}–
              {Math.min(data.page * data.pageSize, data.total)} of {data.total}
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

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="card w-full max-w-2xl p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editing === "new"
                  ? "New enquiry"
                  : `Edit ${editing.enquiryNo}`}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Close"
                className="rounded-md p-1 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Student name *">
                <input
                  required
                  className="input mt-1.5 font-normal"
                  value={form.studentName}
                  onChange={set("studentName")}
                />
              </Field>
              <Field label="Father name *">
                <input
                  required
                  className="input mt-1.5 font-normal"
                  value={form.fatherName}
                  onChange={set("fatherName")}
                />
              </Field>
              <Field label="Contact number *">
                <input
                  required
                  className="input mt-1.5 font-normal"
                  value={form.phone}
                  onChange={set("phone")}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className="input mt-1.5 font-normal"
                  value={form.email}
                  onChange={set("email")}
                />
              </Field>
              <Field label="Date of birth">
                <input
                  type="date"
                  max={todayIso()}
                  className="input mt-1.5 font-normal"
                  value={form.dateOfBirth}
                  onChange={set("dateOfBirth")}
                />
              </Field>
              <Field label="Gender">
                <select
                  className="input mt-1.5 font-normal"
                  value={form.gender}
                  onChange={set("gender")}
                >
                  <option value="">Select…</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </Field>
              <Field label="Interested class">
                <select
                  className="input mt-1.5 font-normal"
                  value={form.interestedClassId}
                  onChange={set("interestedClassId")}
                >
                  <option value="">Select…</option>
                  {classes.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Previous school">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.previousSchool}
                  onChange={set("previousSchool")}
                />
              </Field>
              <Field label="Enquiry date">
                <input
                  type="date"
                  className="input mt-1.5 font-normal"
                  value={form.enquiryDate}
                  onChange={set("enquiryDate")}
                />
              </Field>
              <Field label="Source of enquiry">
                <input
                  className="input mt-1.5 font-normal"
                  placeholder="Walk-in, phone, referral…"
                  value={form.source}
                  onChange={set("source")}
                />
              </Field>
              <Field label="Follow-up date">
                <input
                  type="date"
                  className="input mt-1.5 font-normal"
                  value={form.followUpDate}
                  onChange={set("followUpDate")}
                />
              </Field>
              <Field label="Address">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.address}
                  onChange={set("address")}
                />
              </Field>
              <Field label="Remarks" className="sm:col-span-2">
                <textarea
                  rows={2}
                  className="input mt-1.5 font-normal"
                  value={form.remarks}
                  onChange={set("remarks")}
                />
              </Field>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn border border-slate-300"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="btn-primary" disabled={save.isPending}>
                {save.isPending && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
