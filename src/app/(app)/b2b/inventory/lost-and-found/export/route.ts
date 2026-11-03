import type { NextRequest } from "next/server";
import { registerExport } from "../../_lib/register-page";

export async function GET(request: NextRequest) {
  return registerExport("lost-found", request);
}
