import { Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Field } from "@/features/students/shared";
import { api, apiMessage } from "@/lib/api";
import { useAuth } from "@/store/auth";

export default function PasswordPage() {
  const navigate = useNavigate();
  const forced = useAuth((s) => s.user?.mustChangePassword);
  const [f, setF] = useState({
    currentPassword: "",
    newPassword: "",
    confirm: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const problem =
    f.newPassword.length > 0 && f.newPassword.length < 8
      ? "Use at least 8 characters"
      : f.newPassword && !/[A-Z]/.test(f.newPassword)
        ? "Include an uppercase letter"
        : f.newPassword && !/[0-9]/.test(f.newPassword)
          ? "Include a number"
          : f.confirm && f.confirm !== f.newPassword
            ? "The two passwords do not match"
            : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || !f.newPassword) return;
    setSaving(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: f.currentPassword,
        newPassword: f.newPassword,
      });
      toast.success("Password changed. Please sign in again.");
      useAuth.getState().clear(); // the server has ended every session
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(apiMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Change Password"
        subtitle={
          forced
            ? "You must choose a new password before you can continue."
            : "Choose a strong password. You will be signed out everywhere afterwards."
        }
      />
      <form onSubmit={submit} className="card max-w-md space-y-4 p-6">
        <Field label="Current password">
          <input
            required
            type="password"
            autoComplete="current-password"
            className="input mt-1.5 font-normal"
            value={f.currentPassword}
            onChange={set("currentPassword")}
          />
        </Field>
        <Field
          label="New password"
          error={problem && f.newPassword ? problem : undefined}
        >
          <input
            required
            type="password"
            autoComplete="new-password"
            className="input mt-1.5 font-normal"
            value={f.newPassword}
            onChange={set("newPassword")}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            required
            type="password"
            autoComplete="new-password"
            className="input mt-1.5 font-normal"
            value={f.confirm}
            onChange={set("confirm")}
          />
        </Field>
        <p className="text-xs text-slate-500">
          At least 8 characters, with an uppercase letter and a number.
        </p>
        <button
          className="btn-primary"
          disabled={saving || !!problem || !f.newPassword}
        >
          {saving && <Loader2 size={15} className="animate-spin" />}Change
          password
        </button>
      </form>
    </>
  );
}
