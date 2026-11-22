import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/features/students/shared";
import { METHOD_LABEL, money, monthName } from "./shared";

export interface Slip {
  id: string;
  slipNo: string;
  approvedAt: string | null;
  employee: {
    employeeNo: string;
    fullName: string;
    designation: string;
    department: string | null;
    joiningDate: string;
    cnic: string | null;
    bankName: string | null;
    accountLast4: string | null;
  };
  earnings: { label: string; amount: string }[];
  deductions: { label: string; amount: string }[];
  gross: string;
  totalDeductions: string;
  net: string;
  attendance: {
    present: number;
    halfDays: number;
    absent: number;
    paidLeave: number;
    unpaidLeave: number;
    uncovered: number;
    recorded: number;
    absenceDays: number;
  };
  paid: string;
  balance: string;
  payments: {
    receiptNo: string;
    paidOn: string;
    amount: string;
    method: string;
    reference: string | null;
  }[];
}
export interface SlipsData {
  school: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
  };
  period: string;
  slips: Slip[];
}

export function SalarySlipView({
  data,
  slip,
  className,
}: {
  data: SlipsData;
  slip: Slip;
  className?: string;
}) {
  const e = slip.employee;
  const a = slip.attendance;
  const rows = Math.max(slip.earnings.length, slip.deductions.length);
  return (
    <article
      className={cn(
        "mx-auto flex w-full max-w-[210mm] flex-col border border-slate-300 bg-white p-8 text-[12.5px] leading-snug text-slate-900 print:max-w-none print:border-0 print:p-0 break-after-page last:break-after-auto",
        className,
      )}
    >
      <div className="flex items-center gap-4 border-b-2 border-slate-800 pb-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-300 bg-slate-50">
          {data.school.logoUrl ? (
            <img
              src={data.school.logoUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <GraduationCap size={30} className="text-slate-500" />
          )}
        </div>
        <div className="flex-1 text-center">
          <p className="text-lg font-extrabold uppercase tracking-wide">
            {data.school.name}
          </p>
          {data.school.address && (
            <p className="text-xs text-slate-600">{data.school.address}</p>
          )}
          {(data.school.phone || data.school.email) && (
            <p className="text-xs text-slate-600">
              {[data.school.phone, data.school.email]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="w-14 shrink-0" />
      </div>
      <p className="mt-3 text-center text-base font-bold uppercase tracking-widest">
        Salary Slip · {monthName(data.period)}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border border-slate-300 p-3 sm:grid-cols-3">
        {[
          ["Employee", e.fullName],
          ["Employee no", e.employeeNo],
          ["Slip no", slip.slipNo],
          ["Designation", e.designation],
          ["Department", e.department ?? "—"],
          ["Joined", fmtDate(e.joiningDate)],
          [
            "CNIC",
            e.cnic
              ? `${e.cnic.slice(0, 5)}-${e.cnic.slice(5, 12)}-${e.cnic.slice(12)}`
              : "—",
          ],
          [
            "Bank",
            e.bankName
              ? `${e.bankName}${e.accountLast4 ? ` ····${e.accountLast4}` : ""}`
              : "—",
          ],
        ].map(([l, v]) => (
          <div key={l}>
            <dt className="text-[11px] text-slate-500">{l}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="bg-slate-800 text-left text-white">
            <th className="px-2 py-1.5 font-semibold">Earnings</th>
            <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
            <th className="px-2 py-1.5 font-semibold">Deductions</th>
            <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-b border-slate-300">
              <td className="px-2 py-1.5">{slip.earnings[i]?.label ?? ""}</td>
              <td className="px-2 py-1.5 text-right">
                {slip.earnings[i] ? money(slip.earnings[i].amount) : ""}
              </td>
              <td className="border-l border-slate-300 px-2 py-1.5">
                {slip.deductions[i]?.label ?? ""}
              </td>
              <td className="px-2 py-1.5 text-right">
                {slip.deductions[i] ? money(slip.deductions[i].amount) : ""}
              </td>
            </tr>
          ))}
          <tr className="bg-slate-100 font-bold">
            <td className="px-2 py-1.5">Gross earnings</td>
            <td className="px-2 py-1.5 text-right">{money(slip.gross)}</td>
            <td className="border-l border-slate-300 px-2 py-1.5">
              Total deductions
            </td>
            <td className="px-2 py-1.5 text-right">
              {money(slip.totalDeductions)}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 flex items-center justify-between rounded-lg border-2 border-slate-800 px-4 py-3">
        <span className="text-sm font-bold uppercase tracking-wide">
          Net salary
        </span>
        <span className="text-xl font-extrabold">{money(slip.net)}</span>
      </div>

      <div className="mt-3 rounded-lg border border-slate-300 p-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
          Attendance this month
        </p>
        <p className="mt-1">
          {a.recorded === 0
            ? "No attendance recorded."
            : `Present ${a.present} · Half days ${a.halfDays} · Absent ${a.absent} · Paid leave ${a.paidLeave} · Unpaid leave ${a.unpaidLeave} · Days recorded ${a.recorded}`}
          {a.absenceDays > 0 ? ` · Deducted for ${a.absenceDays} day(s)` : ""}
        </p>
      </div>

      <div className="mt-3 rounded-lg border border-slate-300 p-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
          Payment
        </p>
        {slip.payments.length === 0 ? (
          <p className="mt-1 text-slate-500">Not paid yet.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {slip.payments.map((p) => (
              <li key={p.receiptNo} className="flex justify-between">
                <span>
                  {p.receiptNo} · {fmtDate(p.paidOn)} · {METHOD_LABEL[p.method]}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span>{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-right font-semibold">
          Paid {money(slip.paid)} · Balance {money(slip.balance)}
        </p>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-10 pt-14 text-center text-[11px] text-slate-600">
        <div className="border-t border-slate-500 pt-1">Accountant / HR</div>
        <div className="border-t border-slate-500 pt-1">Employee signature</div>
      </div>
      <p className="mt-3 text-center text-[10px] text-slate-400">
        Computer generated salary slip · Issued{" "}
        {new Date().toLocaleDateString()}
      </p>
    </article>
  );
}
