import { useMutation } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Field, todayIso } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { TYPE_LABEL, useDepartments, useDesignations } from "./shared";

export interface EmployeeValues {
  fullName: string;
  fatherName: string;
  gender: string;
  dateOfBirth: string;
  cnic: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  designationId: string;
  departmentId: string;
  qualification: string;
  joiningDate: string;
  employmentType: string;
  isTeacher: boolean;
  emergencyName: string;
  emergencyPhone: string;
}
export const emptyEmployee = (isTeacher = false): EmployeeValues => ({
  fullName: "",
  fatherName: "",
  gender: "",
  dateOfBirth: "",
  cnic: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  designationId: "",
  departmentId: "",
  qualification: "",
  joiningDate: todayIso(),
  employmentType: "PERMANENT",
  isTeacher,
  emergencyName: "",
  emergencyPhone: "",
});

export function EmployeeForm({
  id,
  initial,
  onClose,
  onSaved,
}: {
  id?: string;
  initial: EmployeeValues;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(initial);
  const designations = useDesignations();
  const departments = useDepartments();
  const set =
    (k: keyof EmployeeValues) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setF((s) => ({ ...s, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...f,
        // Blank text is sent as "clear this field" on edit and ignored on create.
        dateOfBirth: f.dateOfBirth || undefined,
        departmentId: f.departmentId || null,
      };
      return id
        ? api.put(`/staff/employees/${id}`, body)
        : api.post<{ data: { employeeNo: string } }>("/staff/employees", body);
    },
    onSuccess: (res) => {
      toast.success(
        id
          ? "Employee updated"
          : `Employee ${(res.data as { data: { employeeNo: string } }).data.employeeNo} added`,
      );
      onSaved();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

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
        className="card w-full max-w-3xl p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {id ? "Edit employee" : "Add employee"}
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

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name *">
            <input
              required
              className="input mt-1.5 font-normal"
              value={f.fullName}
              onChange={set("fullName")}
            />
          </Field>
          <Field label="Father's name">
            <input
              className="input mt-1.5 font-normal"
              value={f.fatherName}
              onChange={set("fatherName")}
            />
          </Field>
          <Field label="Gender *">
            <select
              required
              className="input mt-1.5 font-normal"
              value={f.gender}
              onChange={set("gender")}
            >
              <option value="">Select…</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              max={todayIso()}
              className="input mt-1.5 font-normal"
              value={f.dateOfBirth}
              onChange={set("dateOfBirth")}
            />
          </Field>
          <Field label="CNIC">
            <input
              className="input mt-1.5 font-normal"
              placeholder="17301-1234567-1"
              value={f.cnic}
              onChange={set("cnic")}
            />
          </Field>
          <Field label="Phone *">
            <input
              required
              className="input mt-1.5 font-normal"
              value={f.phone}
              onChange={set("phone")}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className="input mt-1.5 font-normal"
              value={f.email}
              onChange={set("email")}
            />
          </Field>
          <Field label="City">
            <input
              className="input mt-1.5 font-normal"
              value={f.city}
              onChange={set("city")}
            />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input
              className="input mt-1.5 font-normal"
              value={f.address}
              onChange={set("address")}
            />
          </Field>
          <Field label="Designation *">
            <select
              required
              className="input mt-1.5 font-normal"
              value={f.designationId}
              onChange={(e) => {
                const d = designations.data?.find(
                  (x) => x.id === e.target.value,
                );
                setF((s) => ({
                  ...s,
                  designationId: e.target.value,
                  ...(!id && d ? { isTeacher: !!d.isTeaching } : {}),
                }));
              }}
            >
              <option value="">Select…</option>
              {designations.data
                ?.filter((d) => d.isActive || d.id === f.designationId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Department">
            <select
              className="input mt-1.5 font-normal"
              value={f.departmentId}
              onChange={set("departmentId")}
            >
              <option value="">None</option>
              {departments.data
                ?.filter((d) => d.isActive || d.id === f.departmentId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Qualification">
            <input
              className="input mt-1.5 font-normal"
              value={f.qualification}
              onChange={set("qualification")}
            />
          </Field>
          <Field label="Employment type *">
            <select
              className="input mt-1.5 font-normal"
              value={f.employmentType}
              onChange={set("employmentType")}
            >
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Joining date *">
            <input
              required
              type="date"
              max={todayIso()}
              className="input mt-1.5 font-normal"
              value={f.joiningDate}
              onChange={set("joiningDate")}
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={f.isTeacher}
              onChange={(e) =>
                setF((s) => ({ ...s, isTeacher: e.target.checked }))
              }
            />
            Teaching staff (can be assigned to classes)
          </label>
          <Field label="Emergency contact name">
            <input
              className="input mt-1.5 font-normal"
              value={f.emergencyName}
              onChange={set("emergencyName")}
            />
          </Field>
          <Field label="Emergency contact phone">
            <input
              className="input mt-1.5 font-normal"
              value={f.emergencyPhone}
              onChange={set("emergencyPhone")}
            />
          </Field>
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
