import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Avatar, fmtDate, useDebounced } from "./shared";

interface Row {
  id: string;
  admissionNo: string;
  fullName: string;
  fatherName: string;
  gender: string;
  admissionDate: string;
  passedOutAt: string | null;
  enrollments: {
    rollNo: number | null;
    class: { name: string };
    section: { name: string };
    session: { name: string };
  }[];
  guardians: { guardian: { fullName: string; phone: string } }[];
}
interface Paged {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}

export default function PassedOutPage() {
  const user = useAuth((s) => s.user);
  const [q, setQ] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [gender, setGender] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const params = {
    q: dq || undefined,
    sessionId: sessionId || undefined,
    gender: gender || undefined,
    page,
    pageSize: 20,
  };

  const list = useQuery({
    queryKey: ["students", "passed-out", params],
    queryFn: async () =>
      (await api.get<{ data: Paged }>("/students/passed-out", { params })).data
        .data,
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Passed Out Archive"
        subtitle="Students who graduated. Their full records stay available."
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Search name, father, admission no"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="input"
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All graduation sessions</option>
          {user?.sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={gender}
          onChange={(e) => {
            setGender(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All genders</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Photo</th>
              <th className="px-4 py-3">Admission no</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Father</th>
              <th className="px-4 py-3">Last class</th>
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">Passed out</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3 text-right">View</th>
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
                  {apiMessage(list.error, "Could not load the archive")}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No passed-out students yet. Graduate students from Student
                  Promotion.
                </td>
              </tr>
            )}
            {data?.items.map((r) => {
              const en = r.enrollments[0];
              return (
                <tr
                  key={r.id}
                  className="border-b border-line last:border-0 hover:bg-slate-50/60"
                >
                  <td className="px-4 py-2">
                    <Avatar name={r.fullName} />
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
                  <td className="whitespace-nowrap px-4 py-3">
                    {en ? `${en.class.name} / ${en.section.name}` : "—"}
                  </td>
                  <td className="px-4 py-3">{en?.session.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {fmtDate(r.passedOutAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {r.guardians[0]?.guardian.phone ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to={`/students/view/${r.id}`}
                      className="inline-block rounded-md p-2 text-slate-500 hover:bg-slate-100"
                      aria-label="View profile"
                    >
                      <Eye size={15} />
                    </Link>
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
