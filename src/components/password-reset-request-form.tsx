"use client";

import { useState } from "react";

export function PasswordResetRequestForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setStatus(
      response.ok && data.ok
        ? "If that account exists, a reset email has been sent."
        : data.error ?? "Could not request a password reset.",
    );
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="glass mx-auto max-w-lg space-y-4 rounded-3xl p-6">
      <div>
        <h1 className="text-2xl font-black">Reset your password</h1>
        <p className="mt-2 text-sm text-slate-400">
          Enter your email. Standby does not reveal whether an address is registered.
        </p>
      </div>
      <input
        required
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-lime-400/50"
      />
      <button disabled={busy} className="w-full rounded-2xl bg-lime-400 py-3 font-bold text-ink-950 disabled:opacity-40">
        {busy ? "Sending…" : "Send reset email"}
      </button>
      {status && <p className="text-sm text-slate-300">{status}</p>}
    </form>
  );
}
