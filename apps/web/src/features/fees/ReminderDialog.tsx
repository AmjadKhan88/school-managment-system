import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MessageCircle, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { fmtMoney } from "./shared";

export interface Defaulter {
  studentId: string;
  admissionNo: string;
  fullName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  outstanding: string;
  months: string[];
}

export const DEFAULT_TEMPLATE =
  "Dear {parent_name},\n\nThis is a reminder that {student_name} has outstanding school fees of {amount} for {fee_month}.\n\nPlease contact the school office for assistance.\n\nThank you.";

const monthShort = (k: string) =>
  new Date(`${k}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export function buildMessage(template: string, d: Defaulter) {
  return template
    .replaceAll("{parent_name}", d.guardianName ?? "Parent / Guardian")
    .replaceAll("{student_name}", d.fullName)
    .replaceAll("{amount}", fmtMoney(d.outstanding))
    .replaceAll("{fee_month}", d.months.map(monthShort).join(", "));
}

/** Pakistani numbers: 0300... becomes 92300... for wa.me links. */
export function whatsappNumber(phone: string | null) {
  if (!phone) return null;
  let n = phone.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  else if (n.startsWith("0")) n = `92${n.slice(1)}`;
  return n.length >= 10 ? n : null;
}

export function ReminderDialog({
  items,
  onClose,
}: {
  items: Defaulter[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [done, setDone] = useState<Set<string>>(new Set());

  const log = useMutation({
    mutationFn: (v: {
      studentId: string;
      phone: string | null;
      message: string;
    }) =>
      api.post("/fees/defaulters/reminders", {
        studentId: v.studentId,
        phone: v.phone ?? undefined,
        message: v.message,
      }),
    onSuccess: (_r, v) => {
      setDone((s) => new Set(s).add(v.studentId));
      qc.invalidateQueries({ queryKey: ["fees", "defaulters"] });
    },
    onError: (e) => toast.error(apiMessage(e, "Could not record the reminder")),
  });

  const send = (d: Defaulter) => {
    const number = whatsappNumber(d.guardianPhone);
    if (!number) return;
    const message = buildMessage(template, d);
    window.open(
      `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener",
    );
    log.mutate({ studentId: d.studentId, phone: d.guardianPhone, message });
  };
  const copy = async (d: Defaulter) => {
    await navigator.clipboard.writeText(buildMessage(template, d));
    toast.success("Message copied");
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-4 sm:place-items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            Fee reminder{items.length > 1 ? `s (${items.length})` : ""}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Each button opens WhatsApp with the message ready, and you press send.
          Automatic sending through the WhatsApp Business API is added with the
          notifications module.
        </p>

        <Field
          label="Message template. Variables: {parent_name} {student_name} {amount} {fee_month}"
          className="mt-4"
        >
          <textarea
            rows={6}
            className="input mt-1.5 font-normal"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          />
        </Field>

        <ul className="mt-4 max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {items.map((d) => {
            const number = whatsappNumber(d.guardianPhone);
            return (
              <li
                key={d.studentId}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">
                    {d.fullName}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      {d.admissionNo}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {d.guardianName ?? "No guardian"} ·{" "}
                    {d.guardianPhone ?? "No phone number"} · Due{" "}
                    {fmtMoney(d.outstanding)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {done.has(d.studentId) && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <Check size={14} />
                      Sent
                    </span>
                  )}
                  <button
                    className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                    onClick={() => copy(d)}
                    aria-label="Copy message"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="btn border border-emerald-600 py-1.5 text-emerald-700 disabled:opacity-40"
                    disabled={!number}
                    title={number ? undefined : "No valid phone number"}
                    onClick={() => send(d)}
                  >
                    <MessageCircle size={15} />
                    {done.has(d.studentId) ? "Send again" : "WhatsApp"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
