import { useQuery } from "@tanstack/react-query";
import { calcAge, fmtDate } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { ChildGate, Spinner } from "./ChildGate";

interface Profile {
  admissionNo: string;
  fullName: string;
  fatherName: string;
  motherName: string | null;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string | null;
  admissionDate: string;
  permanentAddress: string | null;
  currentAddress: string | null;
  city: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  needsTransport: boolean;
  guardians: { relation: string; isPrimary: boolean; fullName: string; phone: string; email: string | null }[];
  enrollments: { id: string; rollNo: number | null; status: string; className: string; sectionName: string; session: string }[];
}
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const Info = ({ l, v }: { l: string; v?: string | number | null }) => (
  <div>
    <dt className="text-xs font-semibold text-slate-500">{l}</dt>
    <dd className="mt-0.5 text-sm font-medium text-ink-950">{v || "—"}</dd>
  </div>
);

export default function PortalProfile() {
  return (
    <ChildGate title="Profile">{(c) => <Body studentId={c.id} />}</ChildGate>
  );
}

function Body({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["portal", "profile", studentId],
    queryFn: async () =>
      (await api.get<{ data: Profile }>("/portal/profile", { params: { studentId } })).data.data,
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <div className="card p-6 text-center text-sm text-rose-600">{apiMessage(q.error, "Could not load")}</div>;
  const p = q.data!;
  const age = calcAge(p.dateOfBirth);
  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="text-base font-bold text-ink-950">Student</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info l="Name" v={p.fullName} />
          <Info l="Admission number" v={p.admissionNo} />
          <Info l="Date of birth" v={`${fmtDate(p.dateOfBirth)}${age !== null ? ` (${age} years)` : ""}`} />
          <Info l="Gender" v={cap(p.gender)} />
          <Info l="Blood group" v={p.bloodGroup} />
          <Info l="Admitted on" v={fmtDate(p.admissionDate)} />
          <Info l="Father" v={p.fatherName} />
          <Info l="Mother" v={p.motherName} />
          <Info l="School transport" v={p.needsTransport ? "Yes" : "No"} />
          <Info l="Current address" v={p.currentAddress ?? p.permanentAddress} />
          <Info l="City" v={p.city} />
          <Info l="Emergency contact" v={p.emergencyName ? `${p.emergencyName} ${p.emergencyPhone ?? ""}` : null} />
        </dl>
        <p className="mt-4 text-xs text-slate-500">If anything here is wrong, please ask the school office to correct it.</p>
      </section>
      <section className="card p-5">
        <h2 className="text-base font-bold text-ink-950">Guardians</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {p.guardians.map((g, i) => (
            <div key={i} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-bold">{g.fullName} <span className="font-normal text-slate-500">· {cap(g.relation)}{g.isPrimary ? " · primary" : ""}</span></p>
              <p className="text-slate-600">{g.phone}{g.email ? ` · ${g.email}` : ""}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>{["Session", "Class", "Section", "Roll no", "Status"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody>
            {p.enrollments.map((e) => (
              <tr key={e.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-semibold">{e.session}</td><td className="px-4 py-3">{e.className}</td><td className="px-4 py-3">{e.sectionName}</td><td className="px-4 py-3">{e.rollNo ?? "—"}</td><td className="px-4 py-3">{cap(e.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
