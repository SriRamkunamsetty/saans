import { handleAssess } from "@/lib/api/assess";
import { getAssessDeps } from "@/lib/api/services";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Seconds. Comfortably above the 6 s data timeout plus the 8 s AI timeout. */
export const maxDuration = 25;

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleAssess(request, getAssessDeps());
  } catch (error) {
    return errorResponse(error); // e.g. invalid environment configuration
  }
}
