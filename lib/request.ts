import "server-only";
import { headers } from "next/headers";

// On Vercel the platform sets these headers itself; elsewhere only trust them behind your own proxy.
export async function requestInfo() {
  const h = await headers();
  const ip = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return { ip, ua: (h.get("user-agent") ?? "").slice(0, 200) };
}
