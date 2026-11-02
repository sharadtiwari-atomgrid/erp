import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readStoredFile } from "@/lib/storage";

/** Serves an uploaded document to signed-in users. */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });

  const key = (await params).key.map(decodeURIComponent).join("/");
  const record = await db.opsFile.findFirst({ where: { storageKey: key }, select: { fileName: true, contentType: true } });
  if (!record) return new Response("Not found", { status: 404 });

  const file = await readStoredFile(key);
  if (!file) return new Response("Not found", { status: 404 });

  const download = new URL(request.url).searchParams.has("download");
  const name = encodeURIComponent(record.fileName);
  return new Response(Buffer.from(file.body), {
    headers: {
      "Content-Type": record.contentType || file.contentType || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
