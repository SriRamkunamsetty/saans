import { handleGeocode } from "@/lib/api/geocode";
import { getGeocodeDeps } from "@/lib/api/services";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: Request): Promise<Response> {
  try {
    return await handleGeocode(request, getGeocodeDeps());
  } catch (error) {
    return errorResponse(error);
  }
}
