import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { PageHeader } from "@/components/common/PageHeader";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import {
  clean,
  Field,
  fmtDate,
  todayIso,
  useClasses,
  useDebounced,
} from "./shared";

const guardianSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the guardian name"),
  phone: z.string().trim().min(7, "Enter a valid phone number"),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")),
  occupation: z.string(),
  relation: z.string().min(1, "Select relation"),
  isPrimary: z.boolean(),
});

const schema = z.object({
  fullName: z.string().trim().min(2, "Enter the student name"),
  fatherName: z.string().trim().min(2, "Enter the father's name"),
  motherName: z.string(),
  dateOfBirth: z
    .string()
    .min(1, "Select the date of birth")
    .refine(
      (v) => new Date(v) < new Date(),
      "Date of birth must be in the past",
    ),
  gender: z.string().min(1, "Select gender"),
  bloodGroup: z.string(),
  nationality: z.string().trim().min(2, "Enter nationality"),
  religion: z.string(),
  bFormNo: z.string(),
  previousSchool: z.string(),
  admissionDate: z.string().min(1, "Select the admission date"),
  permanentAddress: z.string(),
  currentAddress: z.string(),
  city: z.string(),
  postalCode: z.string(),
  medicalNotes: z.string(),
  needsTransport: z.boolean(),
  emergencyName: z.string(),
  emergencyPhone: z.string(),
  remarks: z.string(),
  sessionId: z.string().min(1, "Select the session"),
  classId: z.string().min(1, "Select the class"),
  sectionId: z.string().min(1, "Select the section"),
  rollNo: z.string().regex(/^\d*$/, "Numbers only"),
  guardians: z.array(guardianSchema).min(1).max(4),
});
type FormValues = z.infer<typeof schema>;

interface Duplicate {
  id: string;
  admissionNo: string;
  fullName: string;
  fatherName: string;
  dateOfBirth: string;
  status: string;
}
interface SectionOption {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
}
interface EnquiryRow {
  id: string;
  studentName: string;
  fatherName: string;
  phone: string;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  interestedClassId: string | null;
  previousSchool: string | null;
  address: string | null;
  status: string;
}
interface Admitted {
  id: string;
  admissionNo: string;
  fullName: string;
  enrollments: {
    rollNo: number | null;
    class: { name: string };
    section: { name: string };
  }[];
}

const emptyGuardian = (isPrimary = false) => ({
  fullName: "",
  phone: "",
  email: "",
  occupation: "",
  relation: "FATHER",
  isPrimary,
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink-950">{title}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

export default function AdmissionPage() {
  const can = useAuth((s) => s.can);
  const { user, sessionId } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const enquiryId = params.get("enquiryId");

  const [ackDuplicate, setAckDuplicate] = useState(false);
  const [done, setDone] = useState<Admitted | null>(null);

  const defaults = (): FormValues => ({
    fullName: "",
    fatherName: "",
    motherName: "",
    dateOfBirth: "",
    gender: "",
    bloodGroup: "",
    nationality: "Pakistani",
    religion: "",
    bFormNo: "",
    previousSchool: "",
    admissionDate: todayIso(),
    permanentAddress: "",
    currentAddress: "",
    city: "",
    postalCode: "",
    medicalNotes: "",
    needsTransport: false,
    emergencyName: "",
    emergencyPhone: "",
    remarks: "",
    sessionId: sessionId ?? "",
    classId: "",
    sectionId: "",
    rollNo: "",
    guardians: [emptyGuardian(true)],
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "guardians",
  });

  const classes = useClasses();
  const classId = watch("classId");
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

  // ---- Live duplicate check ----
  const [fullName, fatherName, dateOfBirth] = watch([
    "fullName",
    "fatherName",
    "dateOfBirth",
  ]);
  const dupKey = JSON.parse(
    useDebounced(
      JSON.stringify({
        fullName: fullName.trim(),
        fatherName: fatherName.trim(),
        dateOfBirth,
      }),
      600,
    ),
  ) as { fullName: string; fatherName: string; dateOfBirth: string };
  const canCheck =
    dupKey.fullName.length >= 2 &&
    dupKey.fatherName.length >= 2 &&
    !!dupKey.dateOfBirth;
  const dups = useQuery({
    queryKey: ["admission-duplicates", dupKey],
    enabled: canCheck,
    queryFn: async () =>
      (
        await api.get<{ data: Duplicate[] }>("/admissions/duplicates", {
          params: dupKey,
        })
      ).data.data,
  });
  const duplicates = canCheck ? (dups.data ?? []) : [];
  useEffect(() => {
    if (duplicates.length === 0) setAckDuplicate(false);
  }, [duplicates.length]);

  // ---- Pre-fill from an enquiry ----
  const enquiry = useQuery({
    queryKey: ["enquiries", "one", enquiryId],
    enabled: !!enquiryId,
    queryFn: async () =>
      (await api.get<{ data: EnquiryRow }>(`/enquiries/${enquiryId}`)).data
        .data,
  });
  useEffect(() => {
    const e = enquiry.data;
    if (!e) return;
    setValue("fullName", e.studentName);
    setValue("fatherName", e.fatherName);
    if (e.dateOfBirth) setValue("dateOfBirth", e.dateOfBirth.slice(0, 10));
    if (e.gender) setValue("gender", e.gender);
    if (e.previousSchool) setValue("previousSchool", e.previousSchool);
    if (e.address) setValue("permanentAddress", e.address);
    if (e.interestedClassId) setValue("classId", e.interestedClassId);
    setValue("guardians.0.fullName", e.fatherName);
    setValue("guardians.0.phone", e.phone);
    setValue("guardians.0.email", e.email ?? "");
  }, [enquiry.data, setValue]);

  const submit = useMutation({
    mutationFn: (v: FormValues) => {
      const {
        guardians,
        sessionId: sid,
        classId: cid,
        sectionId,
        rollNo,
        ...student
      } = v;
      return api.post<{ data: Admitted }>("/admissions", {
        student: clean(student),
        guardians: guardians.map((g) => clean(g)),
        placement: {
          sessionId: sid,
          classId: cid,
          sectionId,
          rollNo: rollNo || undefined,
        },
        enquiryId: enquiryId ?? undefined,
        confirmDuplicate: ackDuplicate,
      });
    },
    onSuccess: (res) => {
      setDone(res.data.data);
      window.scrollTo({ top: 0 });
    },
    onError: (e) =>
      toast.error(apiMessage(e, "Could not complete the admission")),
  });

  if (!can("admissions", "CREATE")) {
    return (
      <div className="card p-8 text-sm text-slate-600">
        You do not have permission to create admissions.
      </div>
    );
  }

  if (done) {
    const en = done.enrollments[0];
    return (
      <>
        <PageHeader title="New Admission" />
        <div className="card mx-auto max-w-xl p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={44} />
          <h2 className="mt-3 text-xl font-extrabold text-ink-950">
            Admission complete
          </h2>
          <p className="mt-1 text-slate-600">{done.fullName} is enrolled.</p>
          <dl className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-y-2 text-left text-sm">
            <dt className="text-slate-500">Admission no</dt>
            <dd className="font-bold">{done.admissionNo}</dd>
            <dt className="text-slate-500">Class</dt>
            <dd className="font-semibold">{en?.class.name}</dd>
            <dt className="text-slate-500">Section</dt>
            <dd className="font-semibold">{en?.section.name}</dd>
            <dt className="text-slate-500">Roll no</dt>
            <dd className="font-semibold">{en?.rollNo ?? "—"}</dd>
          </dl>
          <div className="mt-6 flex justify-center gap-2">
            <button
              className="btn-primary"
              onClick={() => {
                setDone(null);
                reset(defaults());
                navigate("/students/new-admission", { replace: true });
              }}
            >
              Admit another student
            </button>
            <Link
              to="/students/enquiries"
              className="btn border border-slate-300"
            >
              Back to enquiries
            </Link>
          </div>
        </div>
      </>
    );
  }

  const blocked = duplicates.length > 0 && !ackDuplicate;

  return (
    <>
      <PageHeader
        title="New Admission"
        subtitle="Admission number is generated automatically when you save."
      />

      {enquiry.data?.status === "ADMITTED" && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          This enquiry was already converted to an admission. Saving will be
          refused by the server.
        </div>
      )}

      <form
        onSubmit={handleSubmit((v) => submit.mutate(v))}
        className="space-y-5"
        noValidate
      >
        <Section title="Student information">
          <Field label="Student name *" error={errors.fullName?.message}>
            <input
              className="input mt-1.5 font-normal"
              {...register("fullName")}
            />
          </Field>
          <Field label="Father name *" error={errors.fatherName?.message}>
            <input
              className="input mt-1.5 font-normal"
              {...register("fatherName")}
            />
          </Field>
          <Field label="Mother name">
            <input
              className="input mt-1.5 font-normal"
              {...register("motherName")}
            />
          </Field>
          <Field label="Date of birth *" error={errors.dateOfBirth?.message}>
            <input
              type="date"
              max={todayIso()}
              className="input mt-1.5 font-normal"
              {...register("dateOfBirth")}
            />
          </Field>
          <Field label="Gender *" error={errors.gender?.message}>
            <select
              className="input mt-1.5 font-normal"
              {...register("gender")}
            >
              <option value="">Select…</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Blood group">
            <input
              className="input mt-1.5 font-normal"
              placeholder="e.g. B+"
              {...register("bloodGroup")}
            />
          </Field>
          <Field label="Nationality *" error={errors.nationality?.message}>
            <input
              className="input mt-1.5 font-normal"
              {...register("nationality")}
            />
          </Field>
          <Field label="Religion">
            <input
              className="input mt-1.5 font-normal"
              {...register("religion")}
            />
          </Field>
          <Field label="B-Form / ID number">
            <input
              className="input mt-1.5 font-normal"
              {...register("bFormNo")}
            />
          </Field>
          <Field label="Previous school">
            <input
              className="input mt-1.5 font-normal"
              {...register("previousSchool")}
            />
          </Field>
          <Field label="Admission date *" error={errors.admissionDate?.message}>
            <input
              type="date"
              className="input mt-1.5 font-normal"
              {...register("admissionDate")}
            />
          </Field>
        </Section>

        {duplicates.length > 0 && (
          <div
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
            role="alert"
          >
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle size={16} />
              Possible duplicate student
            </p>
            <ul className="mt-2 space-y-1">
              {duplicates.map((d) => (
                <li key={d.id}>
                  {d.admissionNo}: {d.fullName}, son/daughter of {d.fatherName},
                  born {fmtDate(d.dateOfBirth)} ({d.status.toLowerCase()})
                </li>
              ))}
            </ul>
            <label className="mt-3 flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={ackDuplicate}
                onChange={(e) => setAckDuplicate(e.target.checked)}
              />
              This is a different student, admit anyway
            </label>
          </div>
        )}

        <section className="card p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-950">
              Parent / guardian information
            </h2>
            {fields.length < 4 && (
              <button
                type="button"
                className="btn border border-slate-300 py-1.5"
                onClick={() => append(emptyGuardian())}
              >
                <Plus size={15} />
                Add guardian
              </button>
            )}
          </div>
          <div className="mt-4 space-y-4">
            {fields.map((f, i) => (
              <div key={f.id} className="rounded-xl border border-line p-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field
                    label="Full name *"
                    error={errors.guardians?.[i]?.fullName?.message}
                  >
                    <input
                      className="input mt-1.5 font-normal"
                      {...register(`guardians.${i}.fullName`)}
                    />
                  </Field>
                  <Field
                    label="Relation *"
                    error={errors.guardians?.[i]?.relation?.message}
                  >
                    <select
                      className="input mt-1.5 font-normal"
                      {...register(`guardians.${i}.relation`)}
                    >
                      <option value="FATHER">Father</option>
                      <option value="MOTHER">Mother</option>
                      <option value="GUARDIAN">Guardian</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </Field>
                  <Field
                    label="Phone *"
                    error={errors.guardians?.[i]?.phone?.message}
                  >
                    <input
                      className="input mt-1.5 font-normal"
                      {...register(`guardians.${i}.phone`)}
                    />
                  </Field>
                  <Field
                    label="Email"
                    error={errors.guardians?.[i]?.email?.message}
                  >
                    <input
                      type="email"
                      className="input mt-1.5 font-normal"
                      {...register(`guardians.${i}.email`)}
                    />
                  </Field>
                  <Field label="Occupation">
                    <input
                      className="input mt-1.5 font-normal"
                      {...register(`guardians.${i}.occupation`)}
                    />
                  </Field>
                  <div className="flex items-end justify-between gap-3">
                    <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
                      <input
                        type="radio"
                        name="primaryGuardian"
                        className="h-4 w-4"
                        checked={watch(`guardians.${i}.isPrimary`)}
                        onChange={() =>
                          fields.forEach((_, j) =>
                            setValue(`guardians.${j}.isPrimary`, j === i),
                          )
                        }
                      />
                      Primary contact
                    </label>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="rounded-md p-2 text-rose-500 hover:bg-rose-50"
                        aria-label="Remove guardian"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Section title="Address and emergency contact">
          <Field label="Permanent address">
            <input
              className="input mt-1.5 font-normal"
              {...register("permanentAddress")}
            />
          </Field>
          <Field label="Current address">
            <input
              className="input mt-1.5 font-normal"
              {...register("currentAddress")}
            />
          </Field>
          <Field label="City">
            <input className="input mt-1.5 font-normal" {...register("city")} />
          </Field>
          <Field label="Postal code">
            <input
              className="input mt-1.5 font-normal"
              {...register("postalCode")}
            />
          </Field>
          <Field label="Emergency contact name">
            <input
              className="input mt-1.5 font-normal"
              {...register("emergencyName")}
            />
          </Field>
          <Field label="Emergency contact phone">
            <input
              className="input mt-1.5 font-normal"
              {...register("emergencyPhone")}
            />
          </Field>
        </Section>

        <Section title="Class placement">
          <Field label="Academic session *" error={errors.sessionId?.message}>
            <select
              className="input mt-1.5 font-normal"
              {...register("sessionId")}
            >
              <option value="">Select…</option>
              {user?.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isActive ? " (active)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Class *" error={errors.classId?.message}>
            <select
              className="input mt-1.5 font-normal"
              {...register("classId", {
                onChange: () => setValue("sectionId", ""),
              })}
            >
              <option value="">Select…</option>
              {classes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Section *" error={errors.sectionId?.message}>
            <select
              className="input mt-1.5 font-normal"
              disabled={!classId}
              {...register("sectionId")}
            >
              <option value="">
                {classId ? "Select…" : "Choose a class first"}
              </option>
              {sections.data
                ?.filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (capacity {s.capacity})
                  </option>
                ))}
            </select>
          </Field>
          <Field
            label="Roll number (leave blank for next free)"
            error={errors.rollNo?.message}
          >
            <input
              inputMode="numeric"
              className="input mt-1.5 font-normal"
              {...register("rollNo")}
            />
          </Field>
        </Section>

        <Section title="Additional information">
          <Field label="Medical notes" className="lg:col-span-2">
            <textarea
              rows={2}
              className="input mt-1.5 font-normal"
              {...register("medicalNotes")}
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4"
              {...register("needsTransport")}
            />
            Needs school transport
          </label>
          <Field label="Admission remarks" className="lg:col-span-3">
            <textarea
              rows={2}
              className="input mt-1.5 font-normal"
              {...register("remarks")}
            />
          </Field>
        </Section>

        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <p className="text-sm text-slate-500">
            {blocked
              ? "Confirm the duplicate warning above to continue."
              : enquiryId
                ? "Saving will mark the enquiry as admitted."
                : " "}
          </p>
          <button
            className="btn-primary px-6"
            disabled={submit.isPending || blocked}
          >
            {submit.isPending && <Loader2 size={15} className="animate-spin" />}
            Complete admission
          </button>
        </div>
      </form>
    </>
  );
}
