"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { formatMoney, platformFeeCents, sellerNetCents } from "@/lib/money";

const PRESETS = [
  { label: "Hotel / stay", category: "stay", face: 480 },
  { label: "Restaurant tasting", category: "dining", face: 220 },
  { label: "Event ticket", category: "events", face: 160 },
  { label: "Tee time", category: "sport", face: 240 },
  { label: "Class / workshop", category: "learning", face: 120 },
  { label: "Spa / wellness", category: "wellness", face: 180 },
];

export function SellForm({ defaultCity }: { defaultCity: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    venue: "",
    category: "stay",
    city: defaultCity,
    description: "",
    startsAt: "",
    partySize: "2",
    faceValue: "480",
    price: "298",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const faceCents = useMemo(() => Math.round((Number(form.faceValue) || 0) * 100), [form.faceValue]);
  const priceCents = useMemo(() => Math.round((Number(form.price) || 0) * 100), [form.price]);
  const suggested = Math.round((faceCents * 0.62) / 100);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function applyPreset(p: (typeof PRESETS)[number]) {
    setForm((f) => ({
      ...f,
      category: p.category,
      faceValue: String(p.face),
      price: String(Math.round(p.face * 0.62)),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, faceValueCents: faceCents / 100, priceCents: priceCents / 100 }),
    });
    const data = (await res.json()) as { ok?: boolean; id?: number; error?: string };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Could not publish the listing.");
      setPending(false);
      return;
    }
    router.push(`/listings/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="glass space-y-4 rounded-3xl p-6">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:border-lime-400/40 hover:text-white"
            >
              {p.label}
            </button>
          ))}
        </div>

        <Field label="What is it?">
          <input
            required
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Boutique king room, 2 nights"
            className={inputCls}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Venue / provider">
            <input
              required
              value={form.venue}
              onChange={(e) => set("venue", e.target.value)}
              placeholder="Hotel Vela"
              className={inputCls}
            />
          </Field>
          <Field label="City">
            <input
              required
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="San Francisco"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className={inputCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Starts at">
            <input
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set("startsAt", e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Transfer details">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            placeholder="Name on the booking can be changed up to 24h before check-in…"
            className={inputCls}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Guests">
            <input
              type="number"
              min="1"
              value={form.partySize}
              onChange={(e) => set("partySize", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="You paid ($)">
            <input
              type="number"
              min="1"
              step="1"
              value={form.faceValue}
              onChange={(e) => set("faceValue", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Asking ($)">
            <input
              type="number"
              min="1"
              step="1"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        {Number(form.price) > Number(form.faceValue) && (
          <p className="text-sm text-rose-300">
            Asking price can&apos;t exceed what you paid — nobody buys a booking above face value.
          </p>
        )}

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-lime-400 py-3.5 font-bold text-ink-950 transition hover:bg-lime-300 disabled:opacity-50"
        >
          {pending ? "Publishing…" : "Publish to Standby"}
        </button>
      </div>

      <aside className="space-y-4">
        <div className="glass rounded-3xl p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Your payout
          </h2>
          <p className="mt-4 text-4xl font-black text-white">
            {formatMoney(sellerNetCents(priceCents))}
          </p>
          <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
            <Row k="Asking price" v={formatMoney(priceCents)} />
            <Row k="Platform fee (12%)" v={`− ${formatMoney(platformFeeCents(priceCents))}`} />
            <Row k="Recovered vs. losing it" v={formatMoney(priceCents)} />
          </div>
          <button
            type="button"
            onClick={() => set("price", String(suggested))}
            className="mt-5 w-full rounded-xl border border-lime-400/40 bg-lime-400/10 py-2.5 text-sm font-medium text-lime-300 transition hover:bg-lime-400/20"
          >
            Use suggested price: ${suggested}
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">
            Bookings priced around 60–65% of face value transfer fastest.
          </p>
        </div>

        <div className="glass rounded-3xl p-6 text-sm text-slate-400">
          <h3 className="font-semibold text-white">What happens after you publish</h3>
          <ul className="mt-3 space-y-2">
            <li>• Your listing appears instantly in Browse.</li>
            <li>• When someone claims it, the money is escrowed — you keep the booking until then.</li>
            <li>• Escrow releases to your wallet 3 hours after the booking starts, even if you forget to click anything.</li>
          </ul>
        </div>
      </aside>
    </form>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-lime-400/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{k}</span>
      <span className="text-slate-200">{v}</span>
    </div>
  );
}
