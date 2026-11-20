import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Field, useClasses } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useTeachers } from "./shared";

interface Assignments {
  sections: { id: string; name: string }[];
  subjects: { id: string; name: string; code: string }[];
  classTeachers: { sectionId: string; employeeId: string }[];
  cells: { sectionId: string; subjectId: string; employeeId: string }[];
}

function useAssignments(sessionId: string, classId: string) {
  return useQuery({
    queryKey: ["staff", "assignments", sessionId, classId],
    enabled: !!sessionId && !!classId,
    queryFn: async () =>
      (
        await api.get<{ data: Assignments }>("/staff/assignments", {
          params: { sessionId, classId },
        })
      ).data.data,
  });
}

function Pickers({
  sessionId,
  setSessionId,
  classId,
  setClassId,
}: {
  sessionId: string;
  setSessionId: (v: string) => void;
  classId: string;
  setClassId: (v: string) => void;
}) {
  const { user } = useAuth();
  const classes = useClasses();
  return (
    <div className="card mb-4 grid gap-4 p-4 sm:grid-cols-2">
      <Field label="Session">
        <select
          className="input mt-1.5 font-normal"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        >
          <option value="">Select…</option>
          {user?.sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Class">
        <select
          className="input mt-1.5 font-normal"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">Select…</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

export function ClassTeacherPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const storeSession = useAuth((s) => s.sessionId);
  const [sessionId, setSessionId] = useState(storeSession ?? "");
  const [classId, setClassId] = useState("");
  const [picks, setPicks] = useState<Record<string, string>>({});

  const teachers = useTeachers();
  const a = useAssignments(sessionId, classId);
  useEffect(() => {
    if (a.data)
      setPicks(
        Object.fromEntries(
          a.data.sections.map((s) => [
            s.id,
            a.data!.classTeachers.find((c) => c.sectionId === s.id)
              ?.employeeId ?? "",
          ]),
        ),
      );
  }, [a.data]);

  const save = useMutation({
    mutationFn: () =>
      api.put("/staff/assignments/class-teachers", {
        sessionId,
        classId,
        cells: a.data!.sections.map((s) => ({
          sectionId: s.id,
          employeeId: picks[s.id] || null,
        })),
      }),
    onSuccess: () => {
      toast.success("Class teachers saved");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const dirty =
    !!a.data &&
    a.data.sections.some(
      (s) =>
        (picks[s.id] ?? "") !==
        (a.data!.classTeachers.find((c) => c.sectionId === s.id)?.employeeId ??
          ""),
    );
  const canEdit = can("academics", "EDIT");

  return (
    <>
      <PageHeader
        title="Class Teacher Assignment"
        subtitle="One class teacher per section. A teacher can be class teacher of one section per session. Class teachers take attendance for their section."
      />
      <Pickers
        sessionId={sessionId}
        setSessionId={setSessionId}
        classId={classId}
        setClassId={setClassId}
      />
      {!classId && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose a session and class.
        </div>
      )}
      {a.isLoading && (
        <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
      )}
      {a.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(a.error, "Could not load assignments")}
        </div>
      )}
      {a.data && (
        <>
          {a.data.sections.length === 0 && (
            <div className="card p-8 text-center text-sm text-slate-500">
              This class has no active sections.
            </div>
          )}
          {a.data.sections.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Section</th>
                    <th className="px-4 py-3">Class teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {a.data.sections.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-4 py-3 font-semibold">{s.name}</td>
                      <td className="px-4 py-2">
                        <select
                          className="input max-w-sm py-1.5"
                          disabled={!canEdit}
                          value={picks[s.id] ?? ""}
                          onChange={(e) =>
                            setPicks((p) => ({ ...p, [s.id]: e.target.value }))
                          }
                          aria-label={`Class teacher of section ${s.name}`}
                        >
                          <option value="">Not assigned</option>
                          {teachers.data?.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.fullName} ({t.employeeNo})
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canEdit && a.data.sections.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                className="btn-primary px-6"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Save
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

export function TeacherAssignmentPage() {
  const qc = useQueryClient();
  const can = useAuth((s) => s.can);
  const storeSession = useAuth((s) => s.sessionId);
  const [sessionId, setSessionId] = useState(storeSession ?? "");
  const [classId, setClassId] = useState("");
  const [cells, setCells] = useState<Record<string, string>>({}); // "sectionId:subjectId" -> employeeId

  const teachers = useTeachers();
  const a = useAssignments(sessionId, classId);
  const keyOf = (sec: string, sub: string) => `${sec}:${sub}`;
  const saved = (sec: string, sub: string) =>
    a.data?.cells.find((c) => c.sectionId === sec && c.subjectId === sub)
      ?.employeeId ?? "";
  useEffect(() => {
    if (a.data)
      setCells(
        Object.fromEntries(
          a.data.subjects.flatMap((sub) =>
            a.data!.sections.map((sec) => [
              keyOf(sec.id, sub.id),
              saved(sec.id, sub.id),
            ]),
          ),
        ),
      );
  }, [a.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () =>
      api.put("/staff/assignments/teaching", {
        sessionId,
        classId,
        cells: a.data!.subjects.flatMap((sub) =>
          a.data!.sections.map((sec) => ({
            sectionId: sec.id,
            subjectId: sub.id,
            employeeId: cells[keyOf(sec.id, sub.id)] || null,
          })),
        ),
      }),
    onSuccess: () => {
      toast.success("Subject teachers saved");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const dirty =
    !!a.data &&
    a.data.subjects.some((sub) =>
      a.data!.sections.some(
        (sec) => (cells[keyOf(sec.id, sub.id)] ?? "") !== saved(sec.id, sub.id),
      ),
    );
  const canEdit = can("academics", "EDIT");
  const setRow = (subId: string, employeeId: string) =>
    a.data &&
    setCells((c) => ({
      ...c,
      ...Object.fromEntries(
        a.data!.sections.map((sec) => [keyOf(sec.id, subId), employeeId]),
      ),
    }));

  return (
    <>
      <PageHeader
        title="Teacher Assignment"
        subtitle="Choose who teaches each subject in each section. Teachers enter marks only for the subjects and sections assigned to them."
      />
      <Pickers
        sessionId={sessionId}
        setSessionId={setSessionId}
        classId={classId}
        setClassId={setClassId}
      />
      {!classId && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Choose a session and class.
        </div>
      )}
      {a.isLoading && (
        <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
      )}
      {a.isError && (
        <div className="card p-6 text-center text-sm text-rose-600">
          {apiMessage(a.error, "Could not load assignments")}
        </div>
      )}
      {a.data && a.data.subjects.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No subjects are mapped to this class. Map them under Class-Subject
          Mapping first.
        </div>
      )}
      {a.data && a.data.subjects.length > 0 && a.data.sections.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          This class has no active sections.
        </div>
      )}
      {a.data && a.data.subjects.length > 0 && a.data.sections.length > 0 && (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  {canEdit && (
                    <th className="px-4 py-3">Same for all sections</th>
                  )}
                  {a.data.sections.map((s) => (
                    <th key={s.id} className="px-4 py-3">
                      Section {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.data.subjects.map((sub) => (
                  <tr
                    key={sub.id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">
                      {sub.name}
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        {sub.code}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2">
                        <select
                          className="input w-44 py-1.5"
                          value=""
                          onChange={(e) =>
                            e.target.value &&
                            setRow(
                              sub.id,
                              e.target.value === "__none__"
                                ? ""
                                : e.target.value,
                            )
                          }
                          aria-label={`Set ${sub.name} for all sections`}
                        >
                          <option value="">Choose…</option>
                          <option value="__none__">Clear all</option>
                          {teachers.data?.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.fullName}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    {a.data!.sections.map((sec) => (
                      <td key={sec.id} className="px-4 py-2">
                        <select
                          className="input w-44 py-1.5"
                          disabled={!canEdit}
                          value={cells[keyOf(sec.id, sub.id)] ?? ""}
                          onChange={(e) =>
                            setCells((c) => ({
                              ...c,
                              [keyOf(sec.id, sub.id)]: e.target.value,
                            }))
                          }
                          aria-label={`${sub.name} teacher, section ${sec.name}`}
                        >
                          <option value="">Not assigned</option>
                          {teachers.data?.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.fullName}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="mt-4 flex justify-end">
              <button
                className="btn-primary px-6"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Save
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
