import QRCodeLib from "qrcode";

/**
 * Encodes ONLY the given URL — never any credentials, storage keys, or
 * database info. Called with the public Droplink share URL
 * (https://.../f/<token>) and nothing else.
 */
export async function generateQrDataUrl(value: string, size = 512): Promise<string> {
  return QRCodeLib.toDataURL(value, { width: size, margin: 1 });
}
