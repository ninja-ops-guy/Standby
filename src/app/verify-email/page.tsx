import { Suspense } from "react";
import { VerifyEmailForm } from "@/components/verify-email-form";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-500">Loading…</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
