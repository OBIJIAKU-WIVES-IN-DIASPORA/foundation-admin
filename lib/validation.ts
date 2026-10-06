import { z } from "zod";

export const email = z.string().trim().toLowerCase().max(200).pipe(z.email());
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const codeSchema = z.object({ code: z.string().trim().min(6).max(12) });
export const inviteSchema = z.object({ email, name: z.string().trim().min(2).max(80), password: z.string().min(1).max(128) });
export const newPasswordSchema = z.object({ password: z.string().max(128), confirm: z.string().max(128) }).refine((d) => d.password === d.confirm, { message: "The two passwords don't match.", path: ["confirm"] });
export const objectId = z.string().regex(/^[a-f0-9]{24}$/);

export type FormState = { ok: boolean; message: string; data?: Record<string, string | string[]>; values?: Record<string, string> };
export const first = (e: z.ZodError) => e.issues[0]?.message ?? "Please check your input.";
