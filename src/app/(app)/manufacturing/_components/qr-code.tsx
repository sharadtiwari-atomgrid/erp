import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";

/** Absolute app origin: NEXT_PUBLIC_APP_URL, else derived from the request headers. */
export async function appOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Server-rendered SVG QR code for `value`. */
export async function QrCode({ value, size = 160, className }: { value: string; size?: number; className?: string }) {
  const svg = await QRCode.toString(value, { type: "svg", margin: 1, width: size, errorCorrectionLevel: "M" });
  return <div className={className} style={{ width: size, height: size }} role="img" aria-label={`QR code for ${value}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
