import "server-only";
import type { Filter } from "mongodb";
import type { Donation } from "./types";
import { COUNTRIES } from "./countries";

export const CAUSES = [
  ["all", "Where needed most"], ["education", "Education"], ["health", "Healthcare"], ["skills", "Skills training"],
  ["business", "Micro-business"], ["widows", "Widows"], ["single-parents", "Single parents"], ["elderly", "Elderly care"],
] as const;
export const CURRENCIES = ["NGN", "USD", "GBP", "EUR"] as const;
export const STATUSES = ["successful", "pending", "flagged", "failed", "cancelled", "all"] as const;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

// Every value is checked against an allow-list or parsed to a primitive, so no query operators can be injected.
export function parseFilters(sp: SP) {
  const filter: Filter<Donation> = {};
  const status = one(sp.status) || "successful";
  if (status !== "all" && (STATUSES as readonly string[]).includes(status)) filter.status = status as Donation["status"];
  else if (status !== "all") filter.status = "successful";

  const q = one(sp.q).slice(0, 100);
  if (q) { const re = new RegExp(escapeRe(q), "i"); filter.$or = [{ "donor.name": re }, { "donor.email": re }, { txRef: re }, { receiptNo: re }]; }
  const country = one(sp.country).toUpperCase();
  if (COUNTRIES.some((c) => c.code === country)) filter.country = country;
  const cause = one(sp.cause);
  if (CAUSES.some(([id]) => id === cause)) filter.cause = cause;
  const currency = one(sp.currency).toUpperCase();
  if ((CURRENCIES as readonly string[]).includes(currency)) filter.currency = currency;

  const range: { $gte?: Date; $lte?: Date } = {};
  const from = one(sp.from), to = one(sp.to);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) range.$gte = new Date(from + "T00:00:00Z");
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) range.$lte = new Date(to + "T23:59:59.999Z");
  if (range.$gte || range.$lte) filter.paidAt = range;

  const page = Math.max(1, parseInt(one(sp.page) || "1", 10) || 1);
  return { filter, page, applied: { status, q, country, cause, currency, from, to } };
}
