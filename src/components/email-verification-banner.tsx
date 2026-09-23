"use client";

import { useState } from "react";

export function EmailVerificationBanner() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestVerification() {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/auth/email-verification/request", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      setStatus(
        response.ok && data.ok
          ? "Verification email sent."
          : data.error ?? "Could not send verification email.",
      );
    } catch {
      setStatus("Could not send verification email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
      <div className="font-semibold">Verify your email before production payments are enabled.</div>
      <p className="mt-1 text-amber-200/80">
        Verification is required for the production transaction path.
      </p>
      <button
        type="button"
        onClick={requestVerification}
        disabled={busy}
        className="mt-3 rounded-xl bg-amber-300 px-3 py-2 text-xs font-semibold text-ink-950 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send verification email"}
      </button>
      {status && <p className="mt-2 text-xs">{status}</p>}
    </div>
  );
}
