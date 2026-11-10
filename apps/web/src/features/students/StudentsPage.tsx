import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Pencil,
  RotateCcw,
  Archive,
  Search,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import {
  Avatar,
  fmtDate,
  STUDENT_STATUS_LABEL,
  StudentStatus,
  StudentStatusBadge,
  useClasses,
  useDebounced,
} from "./shared";

interface Row {
  id: string;
  admissionNo: string;
  fullName: string;
  fatherName: string;
  admissionDate: string;
  status: StudentStatus;
  photoUrl: string | null;
  archivedAt: string | null;
  enrollments: {
    rollNo: number | null;
    class: { id: string; name: string };
    section: { id: string; name: string };
  }[];
  guardians: { guardian: { fullName: string; phone: string } }[];
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}
interface SectionOption {
  id: string;
  name: string;
  isActive: boolean;
}

type SortKey = "admissionNo" | "fullName" | "admissionDate";
const PAGE_SIZE = 20;

export default function StudentsPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const { sessionId, user } = useAuth();
  const sessionName = user?.sessions.find((s) => s.id === sessionId)?.name;

  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [gender, setGender] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [archived, setArchived] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("admissionNo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

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

  const params = {
    q: dq || undefined,
    sessionId: sessionId || undefined,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
    gender: gender || undefined,
    status: status || undefined,
    archived: archived ? "true" : "false",
    admissionFrom: from || undefined,
    admissionTo: to || undefined,
    sortBy,
    sortDir,
    page,
    pageSize: PAGE_SIZE,
  };

  const list = useQuery({
    queryKey: ["students", "list", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/students", { params })).data.data,
    placeholderData: keepPreviousData,
  });

  const archive = useMutation({
    mutationFn: (v: { id: string; archived: boolean }) =>
      api.patch(`/students/${v.id}/archive`, { archived: v.archived }),
    onSuccess: (_r, v) => {
      toast.success(v.archived ? "Student archived" : "Student restored");
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  const toggleSort = (k: SortKey) => {
    if (sortBy === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(k);
      setSortDir("asc");
    }
    setPage(1);
  };
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortBy !== k ? null : sortDir === "asc" ? (
      <ArrowUp size={12} />
    ) : (
      <ArrowDown size={12} />
    );

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const sortableTh = (label: string, k: SortKey) => (
    <th className="whitespace-nowrap px-4 py-3">
      <button
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 font-semibold hover:text-slate-800"
      >
        {label}
        <SortIcon k={k} />
      </button>
    </th>
  );

  return (
    <>
      <PageHeader
        title="All Students"
        subtitle={
          sessionName
            ? `Students enrolled in session ${sessionName}. Change the session from the top bar.`
            : "Students enrolled in the active session."
        }
        actions={
          can("admissions", "CREATE") && (
            <Link to="/students/new-admission" className="btn-primary">
              <UserPlus size={16} />
              New admission
            </Link>
          )
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Search name, father, admission no, phone"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setSectionId("");
            setPage(1);
          }}
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
        >
          <option value="">
            {classId ? "All sections" : "Pick a class first"}
          </option>
          {sections.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={gender}
          onChange={(e) => reset(setGender)(e.target.value)}
        >
          <option value="">All genders</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
        <select
          className="input"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value)}
        >
          <option value="">All statuses</option>
          {(Object.keys(STUDENT_STATUS_LABEL) as StudentStatus[]).map((k) => (
            <option key={k} value={k}>
              {STUDENT_STATUS_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          aria-label="Admitted from"
          value={from}
          onChange={(e) => reset(setFrom)(e.target.value)}
        />
        <input
          type="date"
          className="input"
          aria-label="Admitted to"
          value={to}
          onChange={(e) => reset(setTo)(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={archived}
            onChange={(e) => reset(setArchived)(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Photo</th>
              {sortableTh("Admission no", "admissionNo")}
              {sortableTh("Student", "fullName")}
              <th className="px-4 py-3">Father</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Section</th>
              <th className="px-4 py-3">Roll</th>
              <th className="px-4 py-3">Contact</th>
              {sortableTh("Admitted", "admissionDate")}
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
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
                  {apiMessage(list.error, "Could not load students")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No students match these filters.
                </td>
              </tr>
            )}
            {data?.items.map((r) => {
              const en = r.enrollments[0];
              const contact = r.guardians[0]?.guardian;
              return (
                <tr
                  key={r.id}
                  className="border-b border-line last:border-0 hover:bg-slate-50/60"
                >
                  <td className="px-4 py-2">
                    {r.photoUrl ? (
                      <img
                        src={r.photoUrl}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <Avatar name={r.fullName} />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">
                    {r.admissionNo}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/students/view/${r.id}`}
                      className="font-semibold text-ink-950 hover:text-brand-700"
                    >
                      {r.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.fatherName}</td>
                  <td className="px-4 py-3">{en?.class.name ?? "—"}</td>
                  <td className="px-4 py-3">{en?.section.name ?? "—"}</td>
                  <td className="px-4 py-3">{en?.rollNo ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {contact?.phone ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {fmtDate(r.admissionDate)}
                  </td>
                  <td className="px-4 py-3">
                    <StudentStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        to={`/students/view/${r.id}`}
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                        aria-label="View profile"
                      >
                        <Eye size={15} />
                      </Link>
                      {can("students", "EDIT") && (
                        <Link
                          to={`/students/view/${r.id}?edit=1`}
                          className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                          aria-label="Edit"
                        >
                          <Pencil size={15} />
                        </Link>
                      )}
                      {can("students", "DELETE") &&
                        (r.archivedAt ? (
                          <button
                            onClick={() =>
                              archive.mutate({ id: r.id, archived: false })
                            }
                            className="rounded-md p-2 text-emerald-600 hover:bg-emerald-50"
                            aria-label="Restore"
                          >
                            <RotateCcw size={15} />
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              window.confirm(
                                `Archive ${r.fullName}? They will be hidden from this list but all records are kept.`,
                              ) && archive.mutate({ id: r.id, archived: true })
                            }
                            className="rounded-md p-2 text-rose-500 hover:bg-rose-50"
                            aria-label="Archive"
                          >
                            <Archive size={15} />
                          </button>
                        ))}
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
    </>
  );
}
