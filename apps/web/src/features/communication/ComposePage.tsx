import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Eye, Loader2, Send } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Field, useClasses } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import {
  CHANNEL_LABEL,
  Channel,
  Template,
  useChannelStatus,
  useTemplates,
} from "./messaging";

type Aud = "PARENTS_ALL" | "PARENTS_CLASS" | "DEFAULTERS" | "STAFF";
const AUD_LABEL: Record<Aud, string> = {
  PARENTS_ALL: "All parents",
  PARENTS_CLASS: "Parents of a class",
  DEFAULTERS: "Parents of fee defaulters",
  STAFF: "Staff",
};
const VARS: Record<Aud, string> = {
  PARENTS_ALL: "{parent_name} {student_name} {class_name} {school_name}",
  PARENTS_CLASS: "{parent_name} {student_name} {class_name} {school_name}",
  DEFAULTERS:
    "{parent_name} {student_name} {class_name} {amount} {fee_month} {school_name}",
  STAFF: "{staff_name} {school_name}",
};
interface Preview {
  total: number;
  skippedCount: number;
  skipped: { name: string; reason: string }[];
  samples: { to: string; name: string; subject: string | null; body: string }[];
}

export default function ComposePage({
  title,
  subtitle,
  channel: fixed,
  audience: startAud = "PARENTS_ALL",
  lockAudience = false,
}: {
  title: string;
  subtitle?: string;
  channel?: Channel;
  audience?: Aud;
  lockAudience?: boolean;
}) {
  const can = useAuth((s) => s.can);
  const nav = useNavigate();
  const [channel, setChannel] = useState<Channel>(fixed ?? "WHATSAPP");
  const [aud, setAud] = useState<Aud>(startAud);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [minOut, setMinOut] = useState("");
  const [teachersOnly, setTeachersOnly] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [prev, setPrev] = useState<{ key: string; data: Preview } | null>(null);

  const classes = useClasses();
  const templates = useTemplates();
  const status = useChannelStatus();
  const sections = useQuery({
    queryKey: ["/academics/sections", classId],
    enabled: !!classId && aud !== "STAFF" && aud !== "PARENTS_ALL",
    queryFn: async () =>
      (
        await api.get<{ data: { id: string; name: string }[] }>(
          "/academics/sections",
          { params: { classId } },
        )
      ).data.data,
  });

  const apply = (t: Template) => {
    setTemplateId(t.id);
    setBody(t.body);
    setSubject(t.subject ?? "");
  };
  // Fee reminders start from the "Fee reminder" template.
  useEffect(() => {
    if (body || !templates.data || aud !== "DEFAULTERS") return;
    const t = templates.data.find(
      (x) => x.isActive && x.name === "Fee reminder",
    );
    if (t) apply(t);
  }, [templates.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const audience =
    aud === "PARENTS_ALL"
      ? { type: "PARENTS_ALL" }
      : aud === "PARENTS_CLASS"
        ? { type: "PARENTS_CLASS", classId, sectionId: sectionId || undefined }
        : aud === "DEFAULTERS"
          ? {
              type: "DEFAULTERS",
              classId: classId || undefined,
              sectionId: sectionId || undefined,
              minOutstanding: minOut || 0,
            }
          : { type: "STAFF", teachersOnly };
  const payload = {
    channel,
    templateId: templateId || undefined,
    subject: subject || undefined,
    body,
    audience,
  };
  const key = JSON.stringify(payload);
  const ready =
    body.trim().length >= 5 &&
    (aud !== "PARENTS_CLASS" || !!classId) &&
    (channel !== "EMAIL" || !!subject.trim());
  const configured = status.data?.[channel] ?? false;
  const blocked = channel !== "WHATSAPP" && !configured;

  const doPreview = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ data: Preview }>(
          "/communication/messages/preview",
          payload,
        )
      ).data.data,
    onSuccess: (data) => setPrev({ key, data }),
    onError: (e) => toast.error(apiMessage(e)),
  });
  const doSend = useMutation({
    mutationFn: async () =>
      (
        await api.post<{
          data: { id: string; batchNo: string; total: number };
        }>("/communication/messages/send", payload)
      ).data.data,
    onSuccess: (r) => {
      toast.success(
        `${r.batchNo}: ${r.total} message${r.total === 1 ? "" : "s"} queued`,
      );
      nav(`/communication/history?batch=${r.id}`);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const confirmed = prev?.key === key;

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      {status.data &&
        (channel === "WHATSAPP" && !configured ? (
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            The WhatsApp Business API is not connected, so messages are prepared
            and you send each one yourself from History by tapping its link.
          </p>
        ) : blocked ? (
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {CHANNEL_LABEL[channel]} is not set up on the server yet. Add its
            credentials to the server settings (.env), then restart.
          </p>
        ) : null)}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <section className="card space-y-4 p-5">
          {!fixed && (
            <div role="group" className="flex gap-2">
              {(["WHATSAPP", "SMS", "EMAIL"] as Channel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={channel === c}
                  onClick={() => setChannel(c)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold",
                    channel === c
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-500",
                  )}
                >
                  {CHANNEL_LABEL[c]}
                </button>
              ))}
            </div>
          )}
          <Field label="Send to *">
            <select
              className="input mt-1.5 font-normal"
              value={aud}
              disabled={lockAudience}
              onChange={(e) => setAud(e.target.value as Aud)}
            >
              {(Object.keys(AUD_LABEL) as Aud[]).map((k) => (
                <option key={k} value={k}>
                  {AUD_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          {(aud === "PARENTS_CLASS" || aud === "DEFAULTERS") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={aud === "PARENTS_CLASS" ? "Class *" : "Class"}>
                <select
                  className="input mt-1.5 font-normal"
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setSectionId("");
                  }}
                >
                  <option value="">
                    {aud === "DEFAULTERS" ? "All classes" : "Select…"}
                  </option>
                  {classes.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Section">
                <select
                  className="input mt-1.5 font-normal"
                  disabled={!classId}
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                >
                  <option value="">All sections</option>
                  {sections.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          {aud === "DEFAULTERS" && (
            <Field label="Outstanding above (Rs)">
              <input
                type="number"
                min="0"
                className="input mt-1.5 font-normal"
                value={minOut}
                onChange={(e) => setMinOut(e.target.value)}
              />
            </Field>
          )}
          {aud === "STAFF" && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={teachersOnly}
                onChange={(e) => setTeachersOnly(e.target.checked)}
              />
              Teachers only
            </label>
          )}

          <Field label="Template">
            <select
              className="input mt-1.5 font-normal"
              value={templateId}
              onChange={(e) => {
                const t = templates.data?.find((x) => x.id === e.target.value);
                if (t) apply(t);
                else setTemplateId("");
              }}
            >
              <option value="">Write my own</option>
              {templates.data
                ?.filter((t) => t.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </Field>
          {channel === "EMAIL" && (
            <Field label="Subject *">
              <input
                className="input mt-1.5 font-normal"
                maxLength={150}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </Field>
          )}
          <Field label={`Message * (variables: ${VARS[aud]})`}>
            <textarea
              rows={8}
              maxLength={1000}
              className="input mt-1.5 font-normal"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <p className="text-right text-xs text-slate-400">
            {body.length} / 1000
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-bold text-ink-950">
            Check before sending
          </h2>
          <button
            className="btn border border-slate-300 mt-3"
            disabled={!ready || doPreview.isPending}
            onClick={() => doPreview.mutate()}
          >
            {doPreview.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Eye size={16} />
            )}
            Preview recipients
          </button>
          {confirmed && prev && (
            <div className="mt-4 space-y-3 text-sm">
              <p>
                <strong className="text-lg">{prev.data.total}</strong> message
                {prev.data.total === 1 ? "" : "s"} will be sent.
                {prev.data.skippedCount > 0 && (
                  <span className="text-amber-700">
                    {" "}
                    {prev.data.skippedCount} skipped (no valid contact).
                  </span>
                )}
              </p>
              {prev.data.samples.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-line bg-slate-50 p-3"
                >
                  <p className="text-xs font-semibold text-slate-500">
                    To {s.name} · {s.to}
                  </p>
                  {s.subject && (
                    <p className="mt-1 font-semibold">{s.subject}</p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap">{s.body}</p>
                </div>
              ))}
              {prev.data.skipped.length > 0 && (
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer font-semibold">
                    Who is skipped
                  </summary>
                  <ul className="mt-1 list-disc pl-5">
                    {prev.data.skipped.map((s, i) => (
                      <li key={i}>
                        {s.name}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {can("communication", "CREATE") && (
                <button
                  className="btn-primary"
                  disabled={
                    doSend.isPending || blocked || prev.data.total === 0
                  }
                  onClick={() =>
                    window.confirm(
                      `Send ${prev.data.total} message${prev.data.total === 1 ? "" : "s"} by ${CHANNEL_LABEL[channel]}?`,
                    ) && doSend.mutate()
                  }
                >
                  {doSend.isPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Send {prev.data.total} message
                  {prev.data.total === 1 ? "" : "s"}
                </button>
              )}
            </div>
          )}
          {!confirmed && prev && (
            <p className="mt-3 text-xs text-slate-500">
              You changed something. Preview again to send.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
