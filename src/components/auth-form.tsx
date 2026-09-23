"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { SIGNUP_BONUS_CENTS } from "@/lib/money";

export function AuthForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "", city: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = params.get("next") || "/browse";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Something went wrong.");
      setPending(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  function useDemo() {
    setMode("login");
    setForm({ name: "", email: "demo@standby.club", password: "standby123", city: "" });
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-2 lg:items-center">
      <div>
        <h1 className="text-3xl font-black sm:text-4xl">
          {mode === "signup" ? `Start with ${formatMoney(SIGNUP_BONUS_CENTS)} of demo credit.` : "Welcome back."}
        </h1>
        <p className="mt-3 text-slate-400">
          Standby runs on simulated money, so you can buy and sell real marketplace mechanics without
          spending a cent.
        </p>
        <div className="mt-6 space-y-2 text-sm text-slate-400">
          <p>• Sellers recover cash on bookings they&apos;d otherwise lose.</p>
          <p>• Buyers save an average of 40% on last-minute plans.</p>
          <p>• Routine escrow settlement is automated; exceptions stay explicit.</p>
        </div>
        <button
          onClick={useDemo}
          className="mt-6 rounded-full border border-white/15 px-4 py-2 text-sm text-slate-300 transition hover:border-lime-400/50 hover:text-white"
        >
          Fill in the demo account
        </button>
      </div>

      <form onSubmit={submit} className="glass space-y-4 rounded-3xl p-6">
        <div className="flex rounded-full border border-white/10 p-1 text-sm">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-full py-2 font-medium transition ${
                mode === m ? "bg-lime-400 text-ink-950" : "text-slate-400 hover:text-white"
              }`}
            >
              {m === "login" ? "Log in" : "Create account"}
            </button>
          ))}
        </div>

        {mode === "signup" && (
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Full name"
            className={cls}
          />
        )}
        <input
          required
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="you@example.com"
          className={cls}
        />
        <input
          required
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="Password (10+ characters)"
          className={cls}
        />
        {mode === "signup" && (
          <input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="City (optional)"
            className={cls}
          />
        )}

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-lime-400 py-3 font-bold text-ink-950 transition hover:bg-lime-300 disabled:opacity-50"
        >
          {pending ? "Working…" : mode === "login" ? "Log in" : "Create account & claim credit"}
        </button>
        <p className="text-center text-xs text-slate-500">
          Demo credentials: demo@standby.club / standby123 ·{" "}
          <Link href="/browse" className="text-slate-400 hover:text-white">
            browse as guest
          </Link>
          {" · "}
          <Link href="/forgot-password" className="text-slate-400 hover:text-white">
            forgot password
          </Link>
        </p>
      </form>
    </div>
  );
}

const cls =
  "w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-lime-400/50";
