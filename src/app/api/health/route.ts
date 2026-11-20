import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness probe. Deliberately reveals nothing about configuration. */
export function GET(): Response {
  return json({ status: "ok" });
}
