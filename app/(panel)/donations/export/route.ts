import { requireUser } from "@/lib/dal";
import { donations } from "@/lib/db";
import { parseFilters } from "@/lib/donation-query";
import { audit } from "@/lib/audit";
import { consume } from "@/lib/rate-limit";

// Spreadsheet apps run text that starts with = + - @ as a formula, so those cells are neutralised.
const cell = (v: unknown) => {
  let s = v === undefined || v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET(request: Request) {
  const user = await requireUser();
  if (!(await consume(`export:${user.id}`, 10, 3600))) return new Response("Too many exports. Try again later.", { status: 429 });
  const { filter, applied } = parseFilters(Object.fromEntries(new URL(request.url).searchParams));
  const rows = await (await donations()).find(filter).sort({ paidAt: -1, createdAt: -1 }).limit(10_000).toArray();
  await audit("donations.exported", { actor: user, meta: { rows: rows.length, status: applied.status } });
  const head = ["Receipt", "Reference", "Status", "Date", "Donor", "Email", "Country", "Cause", "Currency", "Amount"];
  const lines = rows.map((d) => [d.receiptNo, d.txRef, d.status, (d.paidAt ?? d.createdAt).toISOString(), d.donor.name, d.donor.email, d.country, d.causeLabel, d.currency, (d.amountMinor / 100).toFixed(2)].map(cell).join(","));
  return new Response("﻿" + [head.map(cell).join(","), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="donations-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
