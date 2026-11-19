import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/features/students/shared";
import { EXAM_TYPE_LABEL } from "./shared";

export interface CardSubject {
  name: string;
  totalMarks: number;
  passingMarks: number;
  practicalMarks: number;
  status: string | null;
  theory: number | null;
  practical: number | null;
  obtained: number | null;
  grade: string | null;
  passed: boolean | null;
  remark: string | null;
}
export interface Card {
  student: {
    id: string;
    fullName: string;
    fatherName: string;
    admissionNo: string;
    photoUrl: string | null;
    rollNo: number | null;
    section: string;
  };
  subjects: CardSubject[];
  totals: {
    obtained: number;
    max: number;
    percentage: number | null;
    grade: string | null;
    gradeRemark: string | null;
    gpa: number | null;
    result: "PASS" | "FAIL";
    failedSubjects: number;
    position: number | null;
  };
  attendance: {
    present: number;
    absent: number;
    late: number;
    leave: number;
    halfDay: number;
    recorded: number;
    percent: number | null;
  };
  remarks: { teacher: string | null; principal: string | null };
}
export interface CardsData {
  school: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
  };
  exam: {
    id: string;
    name: string;
    type: string;
    session: string;
    startDate: string;
    endDate: string;
  };
  className: string;
  classSize: number;
  grading: {
    name: string;
    bands: {
      grade: string;
      from: number;
      to: number;
      gradePoint: number;
      remark: string | null;
    }[];
  };
  cards: Card[];
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function ReportCardView({
  data,
  card,
  className,
}: {
  data: CardsData;
  card: Card;
  className?: string;
}) {
  const { school, exam, grading } = data;
  const t = card.totals;
  const a = card.attendance;
  const initials = card.student.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <article
      className={cn(
        "report-card mx-auto flex w-full max-w-[210mm] flex-col border border-slate-300 bg-white p-8 text-[12.5px] leading-snug text-slate-900 print:max-w-none print:border-0 print:p-0 break-after-page last:break-after-auto",
        className,
      )}
    >
      <div className="flex items-center gap-4 border-b-2 border-slate-800 pb-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-300 bg-slate-50">
          {school.logoUrl ? (
            <img
              src={school.logoUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <GraduationCap size={34} className="text-slate-500" />
          )}
        </div>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-xl font-extrabold uppercase tracking-wide">
            {school.name}
          </p>
          {school.address && (
            <p className="text-xs text-slate-600">{school.address}</p>
          )}
          {(school.phone || school.email) && (
            <p className="text-xs text-slate-600">
              {[school.phone, school.email].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="w-16 shrink-0" />
      </div>

      <div className="mt-3 text-center">
        <p className="text-base font-bold uppercase tracking-widest">
          Report Card
        </p>
        <p className="text-sm font-semibold">
          {exam.name}{" "}
          <span className="font-normal text-slate-600">
            ({EXAM_TYPE_LABEL[exam.type]}) · Session {exam.session}
          </span>
        </p>
      </div>

      <div className="mt-3 flex gap-4 rounded-lg border border-slate-300 p-3">
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1.5">
          <div>
            <dt className="text-[11px] text-slate-500">Student</dt>
            <dd className="font-bold">{card.student.fullName}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">Father's name</dt>
            <dd className="font-semibold">{card.student.fatherName}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">Admission no</dt>
            <dd className="font-semibold">{card.student.admissionNo}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">Class / Section</dt>
            <dd className="font-semibold">
              {data.className} / {card.student.section}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">Roll number</dt>
            <dd className="font-semibold">{card.student.rollNo ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">Exam period</dt>
            <dd className="font-semibold">
              {fmtDate(exam.startDate)} to {fmtDate(exam.endDate)}
            </dd>
          </div>
        </dl>
        <div className="grid h-24 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-slate-300 bg-slate-50 text-lg font-bold text-slate-400">
          {card.student.photoUrl ? (
            <img
              src={card.student.photoUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
      </div>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="bg-slate-800 text-left text-white">
            <th className="px-2 py-1.5 font-semibold">Subject</th>
            <th className="px-2 py-1.5 text-center font-semibold">Total</th>
            <th className="px-2 py-1.5 text-center font-semibold">Passing</th>
            <th className="px-2 py-1.5 text-center font-semibold">Obtained</th>
            <th className="px-2 py-1.5 text-center font-semibold">Grade</th>
            <th className="px-2 py-1.5 font-semibold">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {card.subjects.map((s) => (
            <tr key={s.name} className="border-b border-slate-300">
              <td className="px-2 py-1.5 font-semibold">{s.name}</td>
              <td className="px-2 py-1.5 text-center">{s.totalMarks}</td>
              <td className="px-2 py-1.5 text-center">{s.passingMarks}</td>
              <td
                className={cn(
                  "px-2 py-1.5 text-center font-semibold",
                  s.passed === false && "text-rose-700",
                )}
              >
                {s.status === "ABSENT"
                  ? "Abs"
                  : s.status === "EXEMPT"
                    ? "Ex"
                    : (s.obtained ?? "—")}
                {s.practical !== null &&
                  s.theory !== null &&
                  s.practicalMarks > 0 && (
                    <span className="block text-[10px] font-normal text-slate-500">
                      {s.theory} + {s.practical}
                    </span>
                  )}
              </td>
              <td className="px-2 py-1.5 text-center font-bold">
                {s.grade ?? "—"}
              </td>
              <td className="px-2 py-1.5 text-slate-600">
                {s.status === "ABSENT"
                  ? "Absent"
                  : s.status === "EXEMPT"
                    ? "Exempted"
                    : s.passed === false
                      ? "Needs improvement"
                      : (s.remark ?? "")}
              </td>
            </tr>
          ))}
          <tr className="bg-slate-100 font-bold">
            <td className="px-2 py-1.5">Total</td>
            <td className="px-2 py-1.5 text-center">{t.max}</td>
            <td className="px-2 py-1.5" />
            <td className="px-2 py-1.5 text-center">{t.obtained}</td>
            <td className="px-2 py-1.5 text-center">{t.grade ?? "—"}</td>
            <td className="px-2 py-1.5 font-normal text-slate-600">
              {t.gradeRemark ?? ""}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[
          ["Percentage", t.percentage === null ? "—" : `${t.percentage}%`],
          ["GPA", t.gpa === null ? "—" : t.gpa.toFixed(2)],
          [
            "Position",
            t.position ? `${ordinal(t.position)} of ${data.classSize}` : "—",
          ],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-slate-300 p-2">
            <p className="text-[11px] text-slate-500">{l}</p>
            <p className="text-base font-extrabold">{v}</p>
          </div>
        ))}
        <div
          className={cn(
            "rounded-lg border-2 p-2",
            t.result === "PASS"
              ? "border-emerald-600 text-emerald-700"
              : "border-rose-600 text-rose-700",
          )}
        >
          <p className="text-[11px]">Result</p>
          <p className="text-base font-extrabold">
            {t.result === "PASS" ? "PASS" : "FAIL"}
          </p>
          {t.result === "FAIL" && (
            <p className="text-[10px]">
              {t.failedSubjects} subject{t.failedSubjects === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-slate-300 p-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
          Attendance (session start to exam end)
        </p>
        {a.recorded === 0 ? (
          <p className="mt-1 text-slate-500">No attendance recorded.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5">
            <span>
              Present <strong>{a.present}</strong>
            </span>
            <span>
              Absent <strong>{a.absent}</strong>
            </span>
            <span>
              Late <strong>{a.late}</strong>
            </span>
            <span>
              Leave <strong>{a.leave}</strong>
            </span>
            <span>
              Half day <strong>{a.halfDay}</strong>
            </span>
            <span>
              Days recorded <strong>{a.recorded}</strong>
            </span>
            <span>
              Attendance{" "}
              <strong>{a.percent === null ? "—" : `${a.percent}%`}</strong>
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="min-h-[3.5rem] rounded-lg border border-slate-300 p-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
            Class teacher's remarks
          </p>
          <p className="mt-1">{card.remarks.teacher ?? ""}</p>
        </div>
        <div className="min-h-[3.5rem] rounded-lg border border-slate-300 p-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
            Principal's remarks
          </p>
          <p className="mt-1">{card.remarks.principal ?? ""}</p>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-slate-600">
        <span className="font-bold uppercase tracking-wide">
          Grading key ({grading.name}):{" "}
        </span>
        {grading.bands.map((b) => `${b.grade} ${b.from}–${b.to}%`).join(" · ")}
      </div>

      <div className="mt-auto grid grid-cols-3 gap-8 pt-14 text-center text-[11px] text-slate-600">
        <div className="border-t border-slate-500 pt-1">Class teacher</div>
        <div className="border-t border-slate-500 pt-1">Principal</div>
        <div className="border-t border-slate-500 pt-1">Parent / guardian</div>
      </div>
      <p className="mt-3 text-center text-[10px] text-slate-400">
        Issued on {new Date().toLocaleDateString()} · Computer generated report
        card
      </p>
    </article>
  );
}
