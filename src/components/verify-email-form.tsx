"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function VerifyEmailForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    if (!token) {
      setStatus("Verification token is missing.");
      return;
    }

    setBusy(true);
    const response = await fetch("/api/auth/email-verification/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setStatus(response.ok && data.ok ? "Email verified. You can return to Standby." : data.error ?? "Verification failed.");
    setBusy(false);
  }

  return (
    <div className="glass mx-auto max-w-lg rounded-3xl p-6">
      <h1 className="text-2xl font-black">Verify your Standby email</h1>
      <p className="mt-2 text-sm text-slate-400">
        Verification tokens are one-time and expire automatically.
      </p>
      <button
        type="button"
        onClick={verify}
        disabled={busy || !token}
        className="mt-6 w-full rounded-2xl bg-lime-400 py-3 font-bold text-ink-950 disabled:opacity-40"
      >
        {busy ? "Verifying…" : "Verify email"}
      </button>
      {status && <p className="mt-3 text-sm text-slate-300">{status}</p>}
    </div>
  );
}
