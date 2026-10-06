import "server-only";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { decrypt, encrypt } from "./crypto";

const make = (secretBase32: string, label: string) =>
  new OTPAuth.TOTP({ issuer: "Obijiaku Foundation Admin", label, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretBase32) });

export async function newTotpSetup(email: string) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const uri = make(secret, email).toString();
  return { secretEnc: encrypt(secret), secretBase32: secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

/** Returns the matched 30-second step, or null. Callers must reject a step <= the last accepted one (replay). */
export function verifyTotp(secretEnc: string, token: string, email: string): number | null {
  if (!/^\d{6}$/.test(token)) return null;
  const delta = make(decrypt(secretEnc), email).validate({ token, window: 1 });
  return delta === null ? null : Math.floor(Date.now() / 30_000) + delta;
}
