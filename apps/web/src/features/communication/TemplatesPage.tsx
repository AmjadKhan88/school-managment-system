import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/PageHeader";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/store/auth";
import { Template, useTemplates } from "./messaging";

export default function TemplatesPage() {
  const can = useAuth((s) => s.can);
  const q = useTemplates();
  const [dialog, setDialog] = useState<Template | "new" | null>(null);
  return (
    <>
      <PageHeader
        title="Message Templates"
        subtitle="Reusable messages. Variables in curly brackets are filled in for each person."
        actions={
          can("communication", "CREATE") && (
            <button className="btn-primary" onClick={() => setDialog("new")}>
              <Plus size={16} />
              New template
            </button>
          )
        }
      />
      {q.isLoading && (
        <Loader2 className="mx-auto mt-8 animate-spin text-slate-400" />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {q.data?.map((t) => (
          <article
            key={t.id}
            className={cn("card p-4", !t.isActive && "opacity-60")}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-ink-950">
                  {t.name}
                  {!t.isActive && (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      Inactive
                    </span>
                  )}
                </p>
                {t.waTemplateName && (
                  <p className="text-xs text-slate-500">
                    WhatsApp template: {t.waTemplateName} ({t.waLanguage})
                  </p>
                )}
              </div>
              {can("communication", "EDIT") && (
                <button
                  className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                  onClick={() => setDialog(t)}
                  aria-label={`Edit ${t.name}`}
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
              {t.body}
            </p>
          </article>
        ))}
      </div>
      {dialog && (
        <TemplateDialog
          template={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function TemplateDialog({
  template,
  onClose,
}: {
  template: Template | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: template?.name ?? "",
    subject: template?.subject ?? "",
    body: template?.body ?? "",
    waTemplateName: template?.waTemplateName ?? "",
    waLanguage: template?.waLanguage ?? "en",
    isActive: template?.isActive ?? true,
  });
  const save = useMutation({
    mutationFn: () =>
      template
        ? api.put(`/communication/messages/templates/${template.id}`, f)
        : api.post("/communication/messages/templates", f),
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["communication", "templates"] });
      onClose();
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
        className="card w-full max-w-lg p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {template ? "Edit template" : "New template"}
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
        <div className="mt-4 space-y-4">
          <Field label="Name *">
            <input
              required
              className="input mt-1.5 font-normal"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
          <Field label="Email subject (email only)">
            <input
              className="input mt-1.5 font-normal"
              value={f.subject}
              onChange={(e) => setF({ ...f, subject: e.target.value })}
            />
          </Field>
          <Field label="Message *">
            <textarea
              required
              rows={7}
              maxLength={1000}
              className="input mt-1.5 font-normal"
              value={f.body}
              onChange={(e) => setF({ ...f, body: e.target.value })}
            />
          </Field>
          <p className="text-xs text-slate-500">
            Variables:{" "}
            {
              "{parent_name} {student_name} {class_name} {school_name} {amount} {fee_month} {staff_name}"
            }
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Approved WhatsApp template name">
              <input
                className="input mt-1.5 font-normal"
                placeholder="optional"
                value={f.waTemplateName}
                onChange={(e) => setF({ ...f, waTemplateName: e.target.value })}
              />
            </Field>
            <Field label="Language code">
              <input
                className="input mt-1.5 font-normal"
                value={f.waLanguage}
                onChange={(e) => setF({ ...f, waLanguage: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            WhatsApp only lets a school start a conversation with a template
            Meta has approved. Enter that template's exact name here and its
            variables are sent in the order they appear above.
          </p>
          {template && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={f.isActive}
                onChange={(e) => setF({ ...f, isActive: e.target.checked })}
              />
              Active
            </label>
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
