import { getCurrentUser } from "@/lib/auth";
import { distanceResult } from "@/lib/ops/distance";

/** GET /api/distance?from=<pincode>&to=<pincode> → { ok, km } (approximate road km). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const result = await distanceResult(searchParams.get("from") ?? "", searchParams.get("to") ?? "");
  return Response.json(result, { status: result.ok ? 200 : 422 });
}
