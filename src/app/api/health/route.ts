import { connection } from "next/server";
import { db } from "@/lib/db";

/** Liveness check for the hosting platform: the app is up and the database answers. */
export async function GET() {
  await connection();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
}
