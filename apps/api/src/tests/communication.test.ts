import { describe, expect, it } from "vitest";
import {
  inboxListSchema,
  noticeSchema,
} from "../modules/communication/communication.schema";

const base = {
  kind: "NOTICE",
  title: "Winter break",
  body: "School closes on Friday.",
  audience: "ALL",
};

describe("notice payloads", () => {
  it("accepts a simple notice with defaults", () => {
    const r = noticeSchema.parse(base);
    expect(r.classIds).toEqual([]);
    expect(r.isPinned).toBe(false);
    expect(r.expiresOn).toBeUndefined();
  });
  it("needs classes when the audience is CLASS", () => {
    expect(noticeSchema.safeParse({ ...base, audience: "CLASS" }).success).toBe(
      false,
    );
    expect(
      noticeSchema.safeParse({ ...base, audience: "CLASS", classIds: ["c1"] })
        .success,
    ).toBe(true);
  });
  it("rejects a short title, an empty body, a bad kind and a past expiry", () => {
    expect(noticeSchema.safeParse({ ...base, title: "Hi" }).success).toBe(
      false,
    );
    expect(noticeSchema.safeParse({ ...base, body: "" }).success).toBe(false);
    expect(noticeSchema.safeParse({ ...base, kind: "GOSSIP" }).success).toBe(
      false,
    );
    expect(
      noticeSchema.safeParse({ ...base, expiresOn: "2000-01-01" }).success,
    ).toBe(false);
    expect(
      noticeSchema.safeParse({ ...base, expiresOn: "2999-01-01" }).success,
    ).toBe(true);
  });
  it("lets the inbox filter unread only", () => {
    expect(inboxListSchema.parse({ unread: "yes" }).unread).toBe("yes");
    expect(inboxListSchema.safeParse({ unread: "maybe" }).success).toBe(false);
  });
});
