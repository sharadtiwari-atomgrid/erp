import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";

/**
 * Absolute base URL of the app for links printed on labels. Uses
 * NEXT_PUBLIC_APP_URL when set, otherwise the incoming request's host.
 */
export async function appBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function absoluteUrl(path: string): Promise<string> {
  return `${await appBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Renders a QR code for `text` as an SVG string, server-side. */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
