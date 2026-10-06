import "server-only";

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}
export const optionalEnv = (name: string) => process.env[name] || undefined;
export const isProd = process.env.NODE_ENV === "production";
