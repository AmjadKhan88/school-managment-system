import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  Loader2,
  Pencil,
  Printer,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import {
  Avatar,
  calcAge,
  Field,
  fmtDate,
  isoDate,
  StudentStatus,
  StudentStatusBadge,
} from "./shared";

interface Profile {
  id: string;
  admissionNo: string;
  fullName: string;
  fatherName: string;
  motherName: string | null;
  dateOfBirth: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  bloodGroup: string | null;
  nationality: string;
  religion: string | null;
  bFormNo: string | null;
  photoUrl: string | null;
  previousSchool: string | null;
  admissionDate: string;
  status: StudentStatus;
  permanentAddress: string | null;
  currentAddress: string | null;
  city: string | null;
  postalCode: string | null;
  medicalNotes: string | null;
  needsTransport: boolean;
  emergencyName: string | null;
  emergencyPhone: string | null;
  remarks: string | null;
  archivedAt: string | null;
  guardians: {
    relation: string;
    isPrimary: boolean;
    guardian: {
      id: string;
      fullName: string;
      phone: string;
      email: string | null;
      occupation: string | null;
    };
  }[];
  enrollments: {
    id: string;
    rollNo: number | null;
    status: string;
    class: { name: string };
    section: { name: string };
    session: { name: string };
  }[];
  admission: { admissionDate: string; remarks: string | null } | null;
}

type EditForm = {
  fullName: string;
  fatherName: string;
  motherName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  nationality: string;
  religion: string;
  bFormNo: string;
  previousSchool: string;
  permanentAddress: string;
  currentAddress: string;
  city: string;
  postalCode: string;
  medicalNotes: string;
  emergencyName: string;
  emergencyPhone: string;
  remarks: string;
  needsTransport: boolean;
};

const toForm = (p: Profile): EditForm => ({
  fullName: p.fullName,
  fatherName: p.fatherName,
  motherName: p.motherName ?? "",
  dateOfBirth: isoDate(p.dateOfBirth),
  gender: p.gender,
  bloodGroup: p.bloodGroup ?? "",
  nationality: p.nationality,
  religion: p.religion ?? "",
  bFormNo: p.bFormNo ?? "",
  previousSchool: p.previousSchool ?? "",
  permanentAddress: p.permanentAddress ?? "",
  currentAddress: p.currentAddress ?? "",
  city: p.city ?? "",
  postalCode: p.postalCode ?? "",
  medicalNotes: p.medicalNotes ?? "",
  emergencyName: p.emergencyName ?? "",
  emergencyPhone: p.emergencyPhone ?? "",
  remarks: p.remarks ?? "",
  needsTransport: p.needsTransport,
});

const Info = ({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) => (
  <div>
    <dt className="text-xs font-semibold text-slate-500">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-ink-950">{value || "—"}</dd>
  </div>
);

const Block = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="card p-5 sm:p-6">
    <h3 className="text-base font-bold text-ink-950">{title}</h3>
    <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </dl>
  </section>
);

type Tab = "overview" | "guardians" | "history";
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function StudentProfilePage() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);

  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);

  const query = useQuery({
    queryKey: ["students", "one", id],
    queryFn: async () =>
      (await api.get<{ data: Profile }>(`/students/${id}`)).data.data,
  });
  const p = query.data;

  const openEdit = (profile: Profile) => {
    setForm(toForm(profile));
    setEditing(true);
  };

  // Arriving from the list's pencil icon (?edit=1) opens the dialog once the data is ready.
  useEffect(() => {
    if (p && sp.get("edit") === "1" && can("students", "EDIT")) {
      openEdit(p);
      sp.delete("edit");
      setSp(sp, { replace: true });
    }
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => {
      const { dateOfBirth, gender, ...rest } = form!;
      // Required fields are only sent when filled; optional text is sent as-is so it can be cleared.
      return api.put(`/students/${id}`, {
        ...rest,
        ...(dateOfBirth && { dateOfBirth }),
        ...(gender && { gender }),
      });
    },
    onSuccess: () => {
      toast.success("Student updated");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      api.patch(`/students/${id}/archive`, { archived }),
    onSuccess: (_r, archived) => {
      toast.success(archived ? "Student archived" : "Student restored");
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  if (query.isLoading)
    return <Loader2 className="mx-auto mt-20 animate-spin text-slate-400" />;
  if (query.isError || !p) {
    return (
      <div className="card p-8 text-center text-sm text-slate-600">
        {apiMessage(query.error, "Student not found")}
        <div className="mt-4">
          <Link to="/students/all" className="btn-primary">
            Back to students
          </Link>
        </div>
      </div>
    );
  }

  const current = p.enrollments[0];
  const age = calcAge(p.dateOfBirth);
  const set =
    (k: keyof EditForm) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <>
      <Link
        to="/students/all"
        className="no-print mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={15} />
        All students
      </Link>

      <div className="card flex flex-wrap items-center gap-5 p-5 sm:p-6">
        {p.photoUrl ? (
          <img
            src={p.photoUrl}
            alt=""
            className="h-20 w-20 rounded-2xl object-cover"
          />
        ) : (
          <Avatar name={p.fullName} size={80} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-ink-950">
              {p.fullName}
            </h1>
            <StudentStatusBadge status={p.status} />
            {p.archivedAt && (
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                Archived
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {p.admissionNo}
            {current && (
              <>
                {" "}
                · {current.class.name}, Section {current.section.name}, Roll{" "}
                {current.rollNo ?? "—"} ({current.session.name})
              </>
            )}
          </p>
          <p className="text-sm text-slate-500">Father: {p.fatherName}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            className="btn border border-slate-300"
            onClick={() => window.print()}
          >
            <Printer size={16} />
            Print profile
          </button>
          {can("students", "EDIT") && (
            <button className="btn-primary" onClick={() => openEdit(p)}>
              <Pencil size={16} />
              Edit
            </button>
          )}
          {can("students", "DELETE") &&
            (p.archivedAt ? (
              <button
                className="btn border border-emerald-600 text-emerald-700"
                onClick={() => archive.mutate(false)}
              >
                <RotateCcw size={16} />
                Restore
              </button>
            ) : (
              <button
                className="btn border border-rose-300 text-rose-600"
                onClick={() =>
                  window.confirm(
                    `Archive ${p.fullName}? All records are kept.`,
                  ) && archive.mutate(true)
                }
              >
                <Archive size={16} />
                Archive
              </button>
            ))}
        </div>
      </div>

      <div className="no-print mt-5 flex gap-1 border-b border-line">
        {(
          [
            ["overview", "Overview"],
            ["guardians", "Guardians"],
            ["history", "Academic history"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-5">
        {tab === "overview" && (
          <>
            <Block title="Personal details">
              <Info
                label="Date of birth"
                value={`${fmtDate(p.dateOfBirth)}${age !== null ? ` (${age} years)` : ""}`}
              />
              <Info label="Gender" value={cap(p.gender)} />
              <Info label="Blood group" value={p.bloodGroup} />
              <Info label="Nationality" value={p.nationality} />
              <Info label="Religion" value={p.religion} />
              <Info label="B-Form / ID number" value={p.bFormNo} />
              <Info label="Mother" value={p.motherName} />
              <Info label="Previous school" value={p.previousSchool} />
            </Block>
            <Block title="Address and emergency contact">
              <Info label="Permanent address" value={p.permanentAddress} />
              <Info label="Current address" value={p.currentAddress} />
              <Info label="City" value={p.city} />
              <Info label="Postal code" value={p.postalCode} />
              <Info label="Emergency contact" value={p.emergencyName} />
              <Info label="Emergency phone" value={p.emergencyPhone} />
            </Block>
            <Block title="Admission and other information">
              <Info label="Admission number" value={p.admissionNo} />
              <Info
                label="Admission date"
                value={fmtDate(p.admission?.admissionDate ?? p.admissionDate)}
              />
              <Info
                label="Needs transport"
                value={p.needsTransport ? "Yes" : "No"}
              />
              <Info label="Medical notes" value={p.medicalNotes} />
              <Info label="Admission remarks" value={p.admission?.remarks} />
              <Info label="Remarks" value={p.remarks} />
            </Block>
            <p className="no-print text-xs text-slate-500">
              Attendance, fees, results, library, transport, documents and
              communication history will appear on this profile as those modules
              are built.
            </p>
          </>
        )}

        {tab === "guardians" && (
          <div className="grid gap-4 md:grid-cols-2">
            {p.guardians.map((g) => (
              <div key={g.guardian.id} className="card p-5">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-ink-950">
                    {g.guardian.fullName}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {cap(g.relation)}
                  </span>
                  {g.isPrimary && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                      Primary
                    </span>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <Info label="Phone" value={g.guardian.phone} />
                  <Info label="Email" value={g.guardian.email} />
                  <Info label="Occupation" value={g.guardian.occupation} />
                </dl>
              </div>
            ))}
          </div>
        )}

        {tab === "history" && (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Section</th>
                  <th className="px-4 py-3">Roll no</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {p.enrollments.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No enrollment records.
                    </td>
                  </tr>
                )}
                {p.enrollments.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-semibold">
                      {e.session.name}
                    </td>
                    <td className="px-4 py-3">{e.class.name}</td>
                    <td className="px-4 py-3">{e.section.name}</td>
                    <td className="px-4 py-3">{e.rollNo ?? "—"}</td>
                    <td className="px-4 py-3">{cap(e.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && form && (
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
            className="card w-full max-w-3xl p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Edit student</h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                aria-label="Close"
                className="rounded-md p-1 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Class and section change through promotion or transfer, not here.
              Admission number cannot be edited.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Student name *">
                <input
                  required
                  className="input mt-1.5 font-normal"
                  value={form.fullName}
                  onChange={set("fullName")}
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
              <Field label="Mother name">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.motherName}
                  onChange={set("motherName")}
                />
              </Field>
              <Field label="Date of birth *">
                <input
                  required
                  type="date"
                  className="input mt-1.5 font-normal"
                  value={form.dateOfBirth}
                  onChange={set("dateOfBirth")}
                />
              </Field>
              <Field label="Gender *">
                <select
                  required
                  className="input mt-1.5 font-normal"
                  value={form.gender}
                  onChange={set("gender")}
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </Field>
              <Field label="Blood group">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.bloodGroup}
                  onChange={set("bloodGroup")}
                />
              </Field>
              <Field label="Nationality *">
                <input
                  required
                  className="input mt-1.5 font-normal"
                  value={form.nationality}
                  onChange={set("nationality")}
                />
              </Field>
              <Field label="Religion">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.religion}
                  onChange={set("religion")}
                />
              </Field>
              <Field label="B-Form / ID number">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.bFormNo}
                  onChange={set("bFormNo")}
                />
              </Field>
              <Field label="Previous school">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.previousSchool}
                  onChange={set("previousSchool")}
                />
              </Field>
              <Field label="Permanent address">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.permanentAddress}
                  onChange={set("permanentAddress")}
                />
              </Field>
              <Field label="Current address">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.currentAddress}
                  onChange={set("currentAddress")}
                />
              </Field>
              <Field label="City">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.city}
                  onChange={set("city")}
                />
              </Field>
              <Field label="Postal code">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.postalCode}
                  onChange={set("postalCode")}
                />
              </Field>
              <Field label="Emergency contact name">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.emergencyName}
                  onChange={set("emergencyName")}
                />
              </Field>
              <Field label="Emergency contact phone">
                <input
                  className="input mt-1.5 font-normal"
                  value={form.emergencyPhone}
                  onChange={set("emergencyPhone")}
                />
              </Field>
              <Field label="Medical notes" className="sm:col-span-2">
                <textarea
                  rows={2}
                  className="input mt-1.5 font-normal"
                  value={form.medicalNotes}
                  onChange={set("medicalNotes")}
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
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.needsTransport}
                  onChange={(e) =>
                    setForm({ ...form, needsTransport: e.target.checked })
                  }
                />
                Needs school transport
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn border border-slate-300"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button className="btn-primary" disabled={save.isPending}>
                {save.isPending && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Save changes
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
