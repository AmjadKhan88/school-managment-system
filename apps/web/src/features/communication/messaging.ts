import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Channel = "WHATSAPP" | "SMS" | "EMAIL";
export const CHANNEL_LABEL: Record<Channel, string> = {
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "Email",
};
export const STATUS_STYLE: Record<string, [string, string]> = {
  QUEUED: ["Sending", "bg-slate-200 text-slate-600"],
  SENT: ["Sent", "bg-sky-100 text-sky-700"],
  DELIVERED: ["Delivered", "bg-emerald-100 text-emerald-700"],
  READ: ["Read", "bg-teal-100 text-teal-700"],
  FAILED: ["Failed", "bg-rose-100 text-rose-700"],
  MANUAL: ["Ready to send", "bg-amber-100 text-amber-700"],
};

export interface Template {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  waTemplateName: string | null;
  waLanguage: string;
  isActive: boolean;
}
export const useTemplates = () =>
  useQuery({
    queryKey: ["communication", "templates"],
    queryFn: async () =>
      (await api.get<{ data: Template[] }>("/communication/messages/templates"))
        .data.data,
  });
export const useChannelStatus = () =>
  useQuery({
    queryKey: ["communication", "status"],
    queryFn: async () =>
      (
        await api.get<{ data: Record<Channel, boolean> }>(
          "/communication/messages/status",
        )
      ).data.data,
  });
