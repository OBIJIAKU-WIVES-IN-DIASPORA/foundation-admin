import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { auditLogs } from "@/lib/db";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log" };

export default async function Audit() {
  await requireRole("superAdmin");
  const rows = await (await auditLogs()).find({}).sort({ at: -1 }).limit(300).toArray();
  return (
    <div className="space-y-6">
      <h1>Audit log</h1>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500"><tr><th className="pb-2">When</th><th>Event</th><th>Who</th><th>Target</th><th>IP</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={String(r._id)}>
                <td className="whitespace-nowrap py-2 pr-3">{r.at.toLocaleString("en-GB")}</td>
                <td className={`pr-3 font-mono text-xs ${/failed|denied|blocked/.test(r.action) ? "text-red-700" : ""}`}>{r.action}</td>
                <td className="pr-3">{r.actorEmail ?? "–"}</td><td className="pr-3">{r.target ?? "–"}</td><td className="text-xs text-zinc-500">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
