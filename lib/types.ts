import type { ObjectId } from "mongodb";

export type Role = "admin" | "superAdmin";
export type UserStatus = "invited" | "active" | "disabled";

export type AdminUser = {
  _id: ObjectId;
  email: string; // always lowercase
  name: string;
  role: Role;
  status: UserStatus;
  passwordHash?: string;
  totp?: { secretEnc: string; enabledAt: Date; lastStep: number; backupCodes: { hash: string; usedAt?: Date }[] };
  totpPending?: { secretEnc: string; createdAt: Date };
  createdAt: Date;
  createdBy?: ObjectId;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
};

export type AdminSession = {
  _id: ObjectId;
  tokenHash: string;
  userId: ObjectId;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date; // absolute lifetime
  ip: string;
  ua: string;
};

export type AdminChallenge = {
  _id: ObjectId;
  tokenHash: string;
  userId: ObjectId;
  method: "email" | "totp";
  codeHash?: string;
  codeSentAt?: Date;
  sends: number;
  attempts: number;
  expiresAt: Date;
  ip: string;
  trusted?: boolean;
};

// A browser that has completed a full sign-in before. It only relaxes the temporary lockout; it never skips the password or second step.
export type AdminDevice = { _id: ObjectId; tokenHash: string; userId: ObjectId; createdAt: Date; lastUsedAt: Date; expiresAt: Date; ua: string };

export type AdminInvite = { _id: ObjectId; tokenHash: string; userId: ObjectId; expiresAt: Date; usedAt?: Date };

export type AuditLog = {
  _id?: ObjectId;
  at: Date;
  action: string;
  actorId?: ObjectId;
  actorEmail?: string;
  target?: string;
  ip: string;
  ua: string;
  meta?: Record<string, string | number | boolean>;
};

// Written by the public website. This app only reads it.
export type Donation = {
  _id: ObjectId;
  txRef: string;
  receiptNo?: string;
  status: "pending" | "successful" | "failed" | "cancelled" | "flagged";
  amountMinor: number;
  currency: string;
  cause: string;
  causeLabel: string;
  donor: { name: string; email: string; phone?: string };
  country: string;
  createdAt: Date;
  paidAt?: Date;
  flw?: { paymentType?: string };
  emailSentAt?: Date;
  emailError?: string;
};

export type SessionUser = { id: string; email: string; name: string; role: Role; totpEnabled: boolean };
