import { qrSvg } from "../_lib/qr";

/** Server-rendered QR code (inline SVG) for a URL or token. */
export async function QrCode({ value, size = 128, label }: { value: string; size?: number; label?: string }) {
  const svg = await qrSvg(value);
  return (
    <div
      role="img"
      aria-label={label ?? `QR code for ${value}`}
      className="shrink-0 bg-white [&>svg]:h-full [&>svg]:w-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
