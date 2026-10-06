import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { donations } from "@/lib/db";
import { daysAgo } from "@/lib/time";
import { Card, Money } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard() {
  await requireUser();
  const col = await donations();
  const since = daysAgo(30);
  const [r] = await col.aggregate([
    { $facet: {
      totals: [{ $match: { status: "successful" } }, { $group: { _id: "$currency", total: { $sum: "$amountMinor" }, count: { $sum: 1 } } }, { $sort: { total: -1 } }],
      last30: [{ $match: { status: "successful", paidAt: { $gte: since } } }, { $group: { _id: "$currency", total: { $sum: "$amountMinor" }, count: { $sum: 1 } } }],
      donors: [{ $match: { status: "successful" } }, { $group: { _id: "$donor.email" } }, { $count: "n" }],
      flagged: [{ $match: { status: "flagged" } }, { $count: "n" }],
      emailIssues: [{ $match: { status: "successful", emailSentAt: { $exists: false } } }, { $count: "n" }],
    } },
  ]).toArray();
  const recent = await col.find({ status: "successful" }).sort({ paidAt: -1 }).limit(8).toArray();
  const flagged = r.flagged[0]?.n ?? 0, emailIssues = r.emailIssues[0]?.n ?? 0;
  const last30 = new Map<string, { total: number; count: number }>(r.last30.map((x: { _id: string; total: number; count: number }) => [x._id, x]));

  return (
    <div className="space-y-6">
      <h1>Dashboard</h1>
      {(flagged > 0 || emailIssues > 0) && (
        <Card className="border-l-4 border-gold">
          <h2>Needs attention</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
            {flagged > 0 && <li><Link className="underline" href="/donations?status=flagged">{flagged} payment(s) flagged</Link>: the amount paid didn&apos;t match. Check with the donor and Flutterwave.</li>}
            {emailIssues > 0 && <li>{emailIssues} successful donation(s) have no receipt email sent yet.</li>}
          </ul>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {r.totals.length === 0 && <Card className="sm:col-span-3"><p className="text-sm text-zinc-600">No successful donations yet.</p></Card>}
        {r.totals.map((t: { _id: string; total: number; count: number }) => (
          <Card key={t._id}>
            <p className="text-sm text-zinc-500">Total raised ({t._id})</p>
            <p className="mt-1 text-3xl font-medium tracking-tight"><Money minor={t.total} currency={t._id} /></p>
            <p className="mt-2 text-sm text-zinc-600">{t.count} donation(s) · last 30 days: {last30.get(t._id) ? <Money minor={last30.get(t._id)!.total} currency={t._id} /> : "none"}</p>
          </Card>
        ))}
        <Card><p className="text-sm text-zinc-500">Unique donors</p><p className="mt-1 text-3xl font-medium tracking-tight">{r.donors[0]?.n ?? 0}</p></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between"><h2>Latest donations</h2><Link href="/donations" className="text-sm text-brand-700 underline">See all</Link></div>
        <ul className="mt-3 divide-y divide-zinc-100 text-sm">
          {recent.map((d) => (
            <li key={String(d._id)} className="flex items-center justify-between gap-4 py-3">
              <span><span className="font-medium">{d.donor.name}</span> <span className="text-zinc-500">· {d.causeLabel}</span></span>
              <span className="font-medium"><Money minor={d.amountMinor} currency={d.currency} /></span>
            </li>
          ))}
          {recent.length === 0 && <li className="py-3 text-zinc-500">Nothing yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
