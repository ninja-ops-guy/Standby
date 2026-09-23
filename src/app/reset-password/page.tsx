import { Suspense } from "react";
import { PasswordResetForm } from "@/components/password-reset-form";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-500">Loading…</div>}>
      <PasswordResetForm />
    </Suspense>
  );
}
