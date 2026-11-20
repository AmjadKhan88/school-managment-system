import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  UserX,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router-dom";
import { fmtDate, Field, isoDate, todayIso } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { EmployeeForm, EmployeeValues } from "./EmployeeForm";
import {
  EmpStatus,
  ROLE_OPTIONS,
  STATUS_LABEL,
  STATUS_STYLE,
  TYPE_LABEL,
} from "./shared";

interface Detail {
  id: string;
  employeeNo: string;
  fullName: string;
  fatherName: string | null;
  gender: string;
  dateOfBirth: string | null;
  cnic: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  designationId: string;
  designationName: string;
  departmentId: string | null;
  departmentName: string | null;
  qualification: string | null;
  joiningDate: string;
  leavingDate: string | null;
  employmentType: string;
  status: EmpStatus;
  isTeacher: boolean;
  emergencyName: string | null;
  emergencyPhone: string | null;
  payroll: {
    basicSalary: string | null;
    bankName: string | null;
    accountTitle: string | null;
    accountNo: string | null;
  } | null;
  account: {
    email: string;
    isActive: boolean;
    mustChangePassword: boolean;
    lastLoginAt: string | null;
    roles: string[];
  } | null;
  classTeacherOf: { className: string; sectionName: string } | null;
  teaching: { className: string; sectionName: string; subjectName: string }[];
  history: {
    id: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    note: string | null;
    changedAt: string;
    changedBy: string | null;
  }[];
}
type Tab = "overview" | "assignments" | "history" | "salary" | "account";
interface Secret {
  email: string;
  tempPassword: string;
}

const Info = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <dt className="text-xs font-semibold text-slate-500">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-ink-950">{value || "—"}</dd>
  </div>
);

export default function EmployeeProfilePage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);

  const q = useQuery({
    queryKey: ["staff", "employee", id],
    queryFn: async () =>
      (await api.get<{ data: Detail }>(`/staff/employees/${id}`)).data.data,
  });
  const e = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff"] });

  if (q.isLoading)
    return <Loader2 className="mx-auto mt-20 animate-spin text-slate-400" />;
  if (q.isError || !e)
    return (
      <div className="card p-8 text-center text-sm text-slate-600">
        {apiMessage(q.error, "Employee not found")}
        <div className="mt-4">
          <Link to="/staff/members" className="btn-primary">
            Back to staff
          </Link>
        </div>
      </div>
    );

  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["assignments", "Assignments"],
    ["history", "History"],
    ...(e.payroll ? ([["salary", "Salary and bank"]] as [Tab, string][]) : []),
    ["account", "Login account"],
  ];
  const initial: EmployeeValues = {
    fullName: e.fullName,
    fatherName: e.fatherName ?? "",
    gender: e.gender,
    dateOfBirth: isoDate(e.dateOfBirth),
    cnic: e.cnic ?? "",
    phone: e.phone,
    email: e.email ?? "",
    address: e.address ?? "",
    city: e.city ?? "",
    designationId: e.designationId,
    departmentId: e.departmentId ?? "",
    qualification: e.qualification ?? "",
    joiningDate: isoDate(e.joiningDate),
    employmentType: e.employmentType,
    isTeacher: e.isTeacher,
    emergencyName: e.emergencyName ?? "",
    emergencyPhone: e.emergencyPhone ?? "",
  };

  return (
    <>
      <Link
        to={e.isTeacher ? "/staff/teachers" : "/staff/members"}
        className="no-print mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={15} />
        All staff
      </Link>

      <div className="card flex flex-wrap items-center gap-5 p-5 sm:p-6">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-700">
          {e.fullName
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase())
            .join("")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-ink-950">
              {e.fullName}
            </h1>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                STATUS_STYLE[e.status],
              )}
            >
              {STATUS_LABEL[e.status]}
            </span>
            {e.isTeacher && (
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                Teacher
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {e.employeeNo} · {e.designationName}
            {e.departmentName ? ` · ${e.departmentName}` : ""} ·{" "}
            {TYPE_LABEL[e.employmentType]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("staff", "EDIT") && (
            <button className="btn-primary" onClick={() => setEditing(true)}>
              <Pencil size={16} />
              Edit
            </button>
          )}
          {can("staff", "EDIT") && (
            <button
              className="btn border border-slate-300"
              onClick={() => setStatusOpen(true)}
            >
              <UserX size={16} />
              {e.status === "ACTIVE" ? "Mark as left" : "Change status"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-1 border-b border-line">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold",
              tab === k
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "overview" && (
          <div className="card p-5 sm:p-6">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Father's name" value={e.fatherName} />
              <Info
                label="Gender"
                value={e.gender.charAt(0) + e.gender.slice(1).toLowerCase()}
              />
              <Info
                label="Date of birth"
                value={e.dateOfBirth ? fmtDate(e.dateOfBirth) : null}
              />
              <Info
                label="CNIC"
                value={
                  e.cnic
                    ? `${e.cnic.slice(0, 5)}-${e.cnic.slice(5, 12)}-${e.cnic.slice(12)}`
                    : null
                }
              />
              <Info label="Phone" value={e.phone} />
              <Info label="Email" value={e.email} />
              <Info
                label="Address"
                value={[e.address, e.city].filter(Boolean).join(", ")}
              />
              <Info label="Qualification" value={e.qualification} />
              <Info label="Joined" value={fmtDate(e.joiningDate)} />
              {e.leavingDate && (
                <Info label="Left" value={fmtDate(e.leavingDate)} />
              )}
              <Info label="Emergency contact" value={e.emergencyName} />
              <Info label="Emergency phone" value={e.emergencyPhone} />
            </dl>
          </div>
        )}

        {tab === "assignments" && (
          <div className="card p-5 sm:p-6">
            {!e.isTeacher ? (
              <p className="text-sm text-slate-500">
                This employee is not marked as teaching staff.
              </p>
            ) : (
              <>
                <h3 className="text-sm font-bold text-ink-950">
                  Class teacher of
                </h3>
                <p className="mt-1 text-sm">
                  {e.classTeacherOf
                    ? `${e.classTeacherOf.className}, section ${e.classTeacherOf.sectionName}`
                    : "No section this session."}
                </p>
                <h3 className="mt-5 text-sm font-bold text-ink-950">
                  Subjects taught (active session)
                </h3>
                {e.teaching.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">
                    No subject assignments this session.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {e.teaching.map((t, i) => (
                      <li
                        key={i}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        {t.subjectName} · {t.className} {t.sectionName}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-5 text-xs text-slate-500">
                  Change these under Academic Management, Class Teacher
                  Assignment and Teacher Assignment.
                </p>
              </>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">What changed</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">To</th>
                  <th className="px-4 py-3">By</th>
                </tr>
              </thead>
              <tbody>
                {e.history.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No history yet.
                    </td>
                  </tr>
                )}
                {e.history.map((h) => (
                  <tr key={h.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">
                      {fmtDate(h.changedAt)}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {h.field}
                      {h.note && (
                        <span className="block text-xs font-normal text-slate-500">
                          {h.note}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{h.oldValue ?? "—"}</td>
                    <td className="px-4 py-3">{h.newValue ?? "—"}</td>
                    <td className="px-4 py-3">{h.changedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "salary" && e.payroll && (
          <SalaryTab employee={e} onSaved={refresh} />
        )}
        {tab === "account" && (
          <AccountTab employee={e} onSecret={setSecret} onChanged={refresh} />
        )}
      </div>

      {editing && (
        <EmployeeForm
          id={e.id}
          initial={initial}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}
      {statusOpen && (
        <StatusDialog
          employee={e}
          onClose={() => setStatusOpen(false)}
          onSaved={() => {
            setStatusOpen(false);
            refresh();
          }}
        />
      )}
      {secret && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="card w-full max-w-md p-6">
            <h2 className="text-lg font-bold">Temporary password</h2>
            <p className="mt-1 text-sm text-slate-600">
              Give this to {e.fullName} now. It is shown only once and must be
              changed at first sign-in.
            </p>
            <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="font-semibold">{secret.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Password</dt>
                <dd className="select-all font-mono text-base font-bold">
                  {secret.tempPassword}
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="btn border border-slate-300"
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    `Email: ${secret.email}\nPassword: ${secret.tempPassword}`,
                  );
                  toast.success("Copied");
                }}
              >
                <Copy size={15} />
                Copy
              </button>
              <button className="btn-primary" onClick={() => setSecret(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusDialog({
  employee,
  onClose,
  onSaved,
}: {
  employee: Detail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<EmpStatus>(
    employee.status === "ACTIVE" ? "RESIGNED" : "ACTIVE",
  );
  const [leavingDate, setLeavingDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api.post<{ data: { accountDisabled: boolean } }>(
        `/staff/employees/${employee.id}/status`,
        {
          status,
          leavingDate: status === "ACTIVE" ? undefined : leavingDate,
          reason: reason || undefined,
        },
      ),
    onSuccess: (r) => {
      toast.success(
        r.data.data.accountDisabled
          ? "Status changed. Their login was switched off."
          : "Status changed",
      );
      onSaved();
    },
    onError: (err) => toast.error(apiMessage(err)),
  });
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          save.mutate();
        }}
        className="card w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Change status</h2>
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
          <Field label="New status">
            <select
              className="input mt-1.5 font-normal"
              value={status}
              onChange={(ev) => setStatus(ev.target.value as EmpStatus)}
            >
              {(Object.keys(STATUS_LABEL) as EmpStatus[])
                .filter((s) => s !== employee.status)
                .map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
            </select>
          </Field>
          {status !== "ACTIVE" && (
            <Field label="Leaving date">
              <input
                type="date"
                required
                min={isoDate(employee.joiningDate)}
                className="input mt-1.5 font-normal"
                value={leavingDate}
                onChange={(ev) => setLeavingDate(ev.target.value)}
              />
            </Field>
          )}
          <Field label="Reason (optional)">
            <input
              className="input mt-1.5 font-normal"
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
            />
          </Field>
          {status !== "ACTIVE" && employee.account && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              Their login will be switched off and any open sessions ended.
            </p>
          )}
          {status === "ACTIVE" && employee.account && (
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              Their login stays off. Switch it back on under Login account.
            </p>
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
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function SalaryTab({
  employee,
  onSaved,
}: {
  employee: Detail;
  onSaved: () => void;
}) {
  const can = useAuth((s) => s.can);
  const p = employee.payroll!;
  const [f, setF] = useState({
    basicSalary: p.basicSalary ?? "",
    bankName: p.bankName ?? "",
    accountTitle: p.accountTitle ?? "",
    accountNo: p.accountNo ?? "",
  });
  const set =
    (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement>) =>
      setF((s) => ({ ...s, [k]: ev.target.value }));
  const save = useMutation({
    mutationFn: () =>
      api.put(`/staff/employees/${employee.id}/payroll-details`, {
        ...f,
        basicSalary: f.basicSalary === "" ? undefined : Number(f.basicSalary),
      }),
    onSuccess: () => {
      toast.success("Salary and bank details saved");
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const editable = can("payroll", "EDIT");
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        save.mutate();
      }}
      className="card p-5 sm:p-6"
    >
      <p className="mb-4 text-xs text-slate-500">
        Only people with payroll permission can see this tab. Salary changes are
        recorded in the history.
      </p>
      <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
        <Field label="Basic salary (monthly)">
          <input
            type="number"
            min="0"
            step="0.01"
            className="input mt-1.5 font-normal"
            value={f.basicSalary}
            onChange={set("basicSalary")}
          />
        </Field>
        <Field label="Bank name">
          <input
            className="input mt-1.5 font-normal"
            value={f.bankName}
            onChange={set("bankName")}
          />
        </Field>
        <Field label="Account title">
          <input
            className="input mt-1.5 font-normal"
            value={f.accountTitle}
            onChange={set("accountTitle")}
          />
        </Field>
        <Field label="Account number / IBAN">
          <input
            className="input mt-1.5 font-normal"
            value={f.accountNo}
            onChange={set("accountNo")}
          />
        </Field>
      </fieldset>
      {editable && (
        <div className="mt-5 flex justify-end">
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            Save
          </button>
        </div>
      )}
    </form>
  );
}

function AccountTab({
  employee,
  onSecret,
  onChanged,
}: {
  employee: Detail;
  onSecret: (s: Secret) => void;
  onChanged: () => void;
}) {
  const can = useAuth((s) => s.can);
  const [email, setEmail] = useState(employee.email ?? "");
  const [roleSlug, setRoleSlug] = useState(
    employee.isTeacher ? "teacher" : "accountant",
  );

  const create = useMutation({
    mutationFn: () =>
      api.post<{ data: Secret }>(`/staff/employees/${employee.id}/account`, {
        email,
        roleSlug,
      }),
    onSuccess: (r) => {
      onSecret(r.data.data);
      onChanged();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const reset = useMutation({
    mutationFn: () =>
      api.post<{ data: Secret }>(
        `/staff/employees/${employee.id}/account/reset`,
      ),
    onSuccess: (r) => {
      onSecret(r.data.data);
      onChanged();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const active = useMutation({
    mutationFn: (isActive: boolean) =>
      api.post(`/staff/employees/${employee.id}/account/active`, { isActive }),
    onSuccess: (_r, isActive) => {
      toast.success(isActive ? "Login switched on" : "Login switched off");
      onChanged();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const a = employee.account;
  return (
    <div className="card p-5 sm:p-6">
      {a ? (
        <>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Info label="Sign-in email" value={a.email} />
            <Info label="Role" value={a.roles.join(", ")} />
            <Info label="Status" value={a.isActive ? "On" : "Off"} />
            <Info
              label="Last sign-in"
              value={a.lastLoginAt ? fmtDate(a.lastLoginAt) : "Never"}
            />
            {a.mustChangePassword && (
              <Info label="Password" value="Must be changed at next sign-in" />
            )}
          </dl>
          {can("users", "EDIT") && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="btn border border-slate-300"
                disabled={reset.isPending}
                onClick={() =>
                  window.confirm(
                    "Reset the password? They will be signed out everywhere and must use the new temporary password.",
                  ) && reset.mutate()
                }
              >
                <KeyRound size={15} />
                Reset password
              </button>
              <button
                className="btn border border-slate-300"
                disabled={active.isPending}
                onClick={() => active.mutate(!a.isActive)}
              >
                {a.isActive ? "Switch login off" : "Switch login on"}
              </button>
            </div>
          )}
        </>
      ) : !can("users", "CREATE") ? (
        <p className="text-sm text-slate-500">
          This employee has no login. Creating one needs user-management
          permission.
        </p>
      ) : employee.status !== "ACTIVE" ? (
        <p className="text-sm text-slate-500">
          Only active employees can have a login.
        </p>
      ) : (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            create.mutate();
          }}
          className="grid max-w-xl gap-4 sm:grid-cols-2"
        >
          <p className="text-sm text-slate-600 sm:col-span-2">
            This employee has no login yet. A temporary password is generated
            and shown once.
          </p>
          <Field label="Sign-in email *">
            <input
              required
              type="email"
              className="input mt-1.5 font-normal"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
          </Field>
          <Field label="Role *">
            <select
              className="input mt-1.5 font-normal"
              value={roleSlug}
              onChange={(ev) => setRoleSlug(ev.target.value)}
            >
              {ROLE_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={create.isPending}>
              {create.isPending && (
                <Loader2 size={15} className="animate-spin" />
              )}
              Create login
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
