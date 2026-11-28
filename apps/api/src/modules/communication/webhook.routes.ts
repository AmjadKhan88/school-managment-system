import crypto from "crypto";
import { Router } from "express";
import { env } from "../../config/env";
import { applyWhatsAppStatuses } from "./messages.service";

/** Mounted at /webhooks. Meta calls these two URLs; there is no login, so the signature is what protects it. */
export const webhookRouter = Router();

// Meta checks the URL once, when you register it.
webhookRouter.get("/whatsapp", (req, res) => {
  const q = req.query as Record<string, string>;
  if (
    q["hub.mode"] === "subscribe" &&
    env.WHATSAPP_VERIFY_TOKEN &&
    q["hub.verify_token"] === env.WHATSAPP_VERIFY_TOKEN
  )
    return res.status(200).send(q["hub.challenge"]);
  return res.sendStatus(403);
});

// Delivered, read and failed receipts.
webhookRouter.post("/whatsapp", async (req, res) => {
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!env.WHATSAPP_APP_SECRET || !raw) return res.sendStatus(403);
  const expected = Buffer.from(
    `sha256=${crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(raw).digest("hex")}`,
  );
  const given = Buffer.from(req.header("x-hub-signature-256") ?? "");
  if (
    given.length !== expected.length ||
    !crypto.timingSafeEqual(given, expected)
  )
    return res.sendStatus(403);
  res.sendStatus(200); // answer Meta first, then record
  try {
    await applyWhatsAppStatuses(req.body);
  } catch (e) {
    console.error("WhatsApp webhook failed", e);
  }
});
