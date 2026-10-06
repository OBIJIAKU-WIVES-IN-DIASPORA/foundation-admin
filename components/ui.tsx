import type { ReactNode } from "react";

export const input = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500";
export const btn = "inline-flex items-center justify-center rounded-full bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-60";
export const btnGhost = "inline-flex items-center justify-center rounded-full border border-brand-700 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60";
export const btnDanger = "inline-flex items-center justify-center rounded-full border border-red-700 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-white p-6 ${className}`}>{children}</section>;
}

export function Field({ label, name, type = "text", autoComplete, required = true, hint, defaultValue }: { label: string; name: string; type?: string; autoComplete?: string; required?: boolean; hint?: string; defaultValue?: string }) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium text-brand-950">{label}</label>
      <input id={name} name={name} type={type} required={required} autoComplete={autoComplete} defaultValue={defaultValue} className={input} />
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function Status({ state }: { state: { ok: boolean; message: string } }) {
  if (!state.message) return null;
  return <p data-form-status={state.ok ? "ok" : "error"} role={state.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${state.ok ? "bg-brand-50 text-brand-900" : "bg-red-50 text-red-800"}`}>{state.message}</p>;
}

export function Money({ minor, currency }: { minor: number; currency: string }) {
  return <>{new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(minor / 100)}</>;
}
