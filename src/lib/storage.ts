import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * File storage for uploaded documents. Uses an S3-compatible bucket when
 * BUCKET_* environment variables are set (e.g. a Railway bucket), otherwise the
 * local `.data/uploads` folder (gitignored) for development.
 * Files are served to signed-in users through /api/files/<key>.
 */

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

function bucket() {
  const { BUCKET_ENDPOINT, BUCKET_REGION, BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY, BUCKET_NAME } = process.env;
  if (!BUCKET_NAME || !BUCKET_ACCESS_KEY_ID || !BUCKET_SECRET_ACCESS_KEY) return null;
  const client = new S3Client({
    endpoint: BUCKET_ENDPOINT,
    region: BUCKET_REGION || "auto",
    forcePathStyle: true,
    credentials: { accessKeyId: BUCKET_ACCESS_KEY_ID, secretAccessKey: BUCKET_SECRET_ACCESS_KEY },
  });
  return { client, name: BUCKET_NAME };
}

function safeName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
}

/** Stores a file and returns its storage key, e.g. "pod/2026-11/<uuid>-scan.pdf". */
export async function saveFile(file: File, folder: string): Promise<{ key: string; size: number; contentType: string }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const key = `${folder.replace(/[^\w\-/]+/g, "_")}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${safeName(file.name)}`;
  const contentType = file.type || "application/octet-stream";
  const b = bucket();
  if (b) {
    await b.client.send(new PutObjectCommand({ Bucket: b.name, Key: key, Body: bytes, ContentType: contentType }));
  } else {
    const target = path.join(LOCAL_ROOT, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  return { key, size: bytes.length, contentType };
}

/** Reads a stored file. Returns null when it doesn't exist. */
export async function readStoredFile(key: string): Promise<{ body: Uint8Array; contentType?: string } | null> {
  if (key.includes("..")) return null;
  const b = bucket();
  try {
    if (b) {
      const out = await b.client.send(new GetObjectCommand({ Bucket: b.name, Key: key }));
      if (!out.Body) return null;
      return { body: await out.Body.transformToByteArray(), contentType: out.ContentType };
    }
    return { body: await readFile(path.join(LOCAL_ROOT, key)) };
  } catch {
    return null;
  }
}

export async function deleteStoredFile(key: string) {
  const b = bucket();
  try {
    if (b) await b.client.send(new DeleteObjectCommand({ Bucket: b.name, Key: key }));
    else await unlink(path.join(LOCAL_ROOT, key));
  } catch {
    // Already gone.
  }
}

/** URL a signed-in user opens to view a stored file. */
export function fileUrl(key: string, download = false) {
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}${download ? "?download=1" : ""}`;
}
