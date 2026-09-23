import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await ensureSeeded();
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-500">Loading…</div>}>
      <AuthForm />
    </Suspense>
  );
}
