"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function PasswordResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) {
      setStatus("Reset token is missing.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setStatus(
      response.ok && data.ok
        ? "Password changed. Existing sessions were revoked; log in again."
        : data.error ?? "Password reset failed.",
    );
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="glass mx-auto max-w-lg space-y-4 rounded-3xl p-6">
      <div>
        <h1 className="text-2xl font-black">Choose a new password</h1>
        <p className="mt-2 text-sm text-slate-400">
          Reset links are one-time. Changing your password revokes existing sessions.
        </p>
      </div>
      <input
        required
        minLength={10}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="10+ characters"
        className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-lime-400/50"
      />
      <button disabled={busy || !token} className="w-full rounded-2xl bg-lime-400 py-3 font-bold text-ink-950 disabled:opacity-40">
        {busy ? "Updating…" : "Update password"}
      </button>
      {status && <p className="text-sm text-slate-300">{status}</p>}
    </form>
  );
}
