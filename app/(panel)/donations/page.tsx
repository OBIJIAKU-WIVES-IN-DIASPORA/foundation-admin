import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { donations } from "@/lib/db";
import { CAUSES, CURRENCIES, STATUSES, parseFilters } from "@/lib/donation-query";
import { COUNTRIES, countryName } from "@/lib/countries";
import { Card, Money, btn, btnGhost, input } from "@/components/ui";

export const metadata: Metadata = { title: "Donations" };
const PER_PAGE = 25;

export default async function Donations({ searchParams }: PageProps<"/donations">) {
  await requireUser();
  const sp = await searchParams;
  const { filter, page, applied } = parseFilters(sp);
  const col = await donations();
  const [rows, total] = await Promise.all([
    col.find(filter).sort({ paidAt: -1, createdAt: -1 }).skip((page - 1) * PER_PAGE).limit(PER_PAGE).toArray(),
    col.countDocuments(filter),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = (p: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)), page: String(p) }).toString();
  const exportQs = new URLSearchParams(Object.fromEntries(Object.entries(applied).filter(([, v]) => v))).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Donations</h1>
        <a href={`/donations/export?${exportQs}`} className={btnGhost}>Export CSV</a>
      </div>
      <Card>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm lg:col-span-2">Search<input name="q" defaultValue={applied.q} placeholder="Name, email, receipt or reference" className={input} /></label>
          <label className="text-sm">Status<select name="status" defaultValue={applied.status} className={input}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="text-sm">Cause<select name="cause" defaultValue={applied.cause} className={input}><option value="">All causes</option>{CAUSES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
          <label className="text-sm">Country<select name="country" defaultValue={applied.country} className={input}><option value="">All countries</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
          <label className="text-sm">Currency<select name="currency" defaultValue={applied.currency} className={input}><option value="">All</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-sm">From<input type="date" name="from" defaultValue={applied.from} className={input} /></label>
          <label className="text-sm">To<input type="date" name="to" defaultValue={applied.to} className={input} /></label>
          <div className="flex items-end gap-2 lg:col-span-4"><button className={btn}>Apply filters</button><Link href="/donations" className={btnGhost}>Clear</Link></div>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        <p className="mb-3 text-sm text-zinc-600">{total} result(s)</p>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500"><tr><th className="pb-2">Date</th><th>Donor</th><th>Cause</th><th>Country</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((d) => (
              <tr key={String(d._id)}>
                <td className="py-3 pr-3 whitespace-nowrap">{(d.paidAt ?? d.createdAt).toLocaleDateString("en-GB")}</td>
                <td className="pr-3"><div className="font-medium">{d.donor.name}</div><div className="text-xs text-zinc-500">{d.donor.email}</div><div className="text-xs text-zinc-400">{d.receiptNo ?? d.txRef}</div></td>
                <td className="pr-3">{d.causeLabel}</td>
                <td className="pr-3">{countryName(d.country)}</td>
                <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${d.status === "successful" ? "bg-brand-50 text-brand-900" : d.status === "flagged" ? "bg-amber-100 text-amber-900" : "bg-zinc-100 text-zinc-700"}`}>{d.status}</span></td>
                <td className="text-right font-medium"><Money minor={d.amountMinor} currency={d.currency} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-zinc-500">No donations match.</td></tr>}
          </tbody>
        </table>
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link className="text-brand-700 underline" href={`/donations?${qs(page - 1)}`}>← Newer</Link> : <span />}
          <span className="text-zinc-500">Page {page} of {pages}</span>
          {page < pages ? <Link className="text-brand-700 underline" href={`/donations?${qs(page + 1)}`}>Older →</Link> : <span />}
        </div>
      </Card>
    </div>
  );
}
