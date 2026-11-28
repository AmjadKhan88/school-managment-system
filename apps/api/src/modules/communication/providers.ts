import nodemailer from "nodemailer";
import { env } from "../../config/env";
import type { Channel } from "./messages.schema";

export interface SendInput {
  to: string; // digits for WhatsApp and SMS, an address for email
  body: string;
  subject?: string;
  template?: { name: string; language: string; params: string[] };
}
export interface SendResult {
  status: "SENT" | "MANUAL" | "FAILED";
  provider: string;
  id?: string;
  error?: string;
}

export const configured: Record<Channel, () => boolean> = {
  WHATSAPP: () => !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
  SMS: () =>
    !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM),
  EMAIL: () => !!(env.SMTP_HOST && env.SMTP_FROM),
};

const fail = (provider: string, e: unknown): SendResult => ({
  status: "FAILED",
  provider,
  error: e instanceof Error ? e.message : "Network error",
});

/** Official WhatsApp Business Cloud API. Without credentials the message is left for manual sending. */
async function sendWhatsApp(i: SendInput): Promise<SendResult> {
  if (!configured.WHATSAPP()) return { status: "MANUAL", provider: "manual" };
  const payload = i.template
    ? {
        messaging_product: "whatsapp",
        to: i.to,
        type: "template",
        template: {
          name: i.template.name,
          language: { code: i.template.language },
          components: i.template.params.length
            ? [
                {
                  type: "body",
                  parameters: i.template.params.map((text) => ({
                    type: "text",
                    text,
                  })),
                },
              ]
            : [],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: i.to,
        type: "text",
        text: { body: i.body, preview_url: false },
      };
  try {
    const r = await fetch(
      `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const j = (await r.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!r.ok || !j.messages?.[0])
      return {
        status: "FAILED",
        provider: "whatsapp",
        error: j.error?.message ?? `WhatsApp returned ${r.status}`,
      };
    return { status: "SENT", provider: "whatsapp", id: j.messages[0].id };
  } catch (e) {
    return fail("whatsapp", e);
  }
}

/** SMS through Twilio. To use another SMS company, replace this one function. */
async function sendSms(i: SendInput): Promise<SendResult> {
  if (!configured.SMS())
    return {
      status: "FAILED",
      provider: "twilio",
      error: "SMS is not configured",
    };
  try {
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: `+${i.to}`,
          From: env.TWILIO_FROM!,
          Body: i.body,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const j = (await r.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
    };
    if (!r.ok || !j.sid)
      return {
        status: "FAILED",
        provider: "twilio",
        error: j.message ?? `Twilio returned ${r.status}`,
      };
    return { status: "SENT", provider: "twilio", id: j.sid };
  } catch (e) {
    return fail("twilio", e);
  }
}

let mailer: nodemailer.Transporter | null = null;
const transporter = () =>
  (mailer ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  }));

async function sendEmail(i: SendInput): Promise<SendResult> {
  if (!configured.EMAIL())
    return {
      status: "FAILED",
      provider: "smtp",
      error: "Email is not configured",
    };
  try {
    const info = await transporter().sendMail({
      from: env.SMTP_FROM,
      to: i.to,
      subject: i.subject ?? "Message from the school",
      text: i.body,
    });
    return { status: "SENT", provider: "smtp", id: String(info.messageId) };
  } catch (e) {
    return fail("smtp", e);
  }
}

export const send = (channel: Channel, i: SendInput) =>
  channel === "WHATSAPP"
    ? sendWhatsApp(i)
    : channel === "SMS"
      ? sendSms(i)
      : sendEmail(i);
