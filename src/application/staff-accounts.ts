import { timingSafeEqual } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken } from "../infrastructure/secrets.js";
import { hashPassword, passwordProblem, verifyPassword } from "../infrastructure/passwords.js";
import type { StaffRole } from "./staff-operations.js";

/**
 * Staff sign-in with email and password. Sessions and one-time password links are random tokens stored only as
 * hashes. Five wrong passwords lock an account for 15 minutes; an administrator's reset link unlocks it.
 */
export interface StaffIdentity { actor: string; role: StaffRole; }
export interface StaffLoginRecord { id: string; email: string; role: StaffRole; passwordHash: string | null; failedLogins: number; lockedUntil: Date | null; }
export type PasswordLinkPurpose = "invite" | "reset";

export interface StaffAccountsRepository {
  findActiveStaffForLogin(email: string): Promise<StaffLoginRecord | null>;
  recordFailedLogin(staffId: string, lockUntil: Date | null): Promise<void>;
  recordSuccessfulLogin(staffId: string): Promise<void>;
  createStaffSession(staffId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findStaffSession(tokenHash: string): Promise<(StaffIdentity & { staffId: string }) | null>;
  revokeStaffSession(tokenHash: string): Promise<void>;
  /** Revokes every session of the person, except the one with `keepTokenHash`. */
  revokeStaffSessions(staffId: string, keepTokenHash?: string): Promise<void>;
  /** Returns false when there is no active staff account with that email. */
  createPasswordLink(email: string, tokenHash: string, purpose: PasswordLinkPurpose, createdBy: string, expiresAt: Date): Promise<boolean>;
  findPasswordLink(tokenHash: string): Promise<{ email: string; purpose: PasswordLinkPurpose } | null>;
  /** Uses the link once: sets the password, clears any lockout and ends every existing session. */
  setPasswordWithLink(tokenHash: string, passwordHash: string): Promise<{ staffId: string; email: string; role: StaffRole } | null>;
  setPassword(staffId: string, passwordHash: string): Promise<void>;
  passwordHashFor(staffId: string): Promise<string | null>;
  /** True until some active administrator has a password: the one-time setup page is open until then. */
  needsFirstAdministrator(): Promise<boolean>;
  /** Creates (or completes) an administrator account with a password, only while no administrator has one. */
  createFirstAdministrator(email: string, passwordHash: string, apiTokenHash: string): Promise<boolean>;
}

export class SignInError extends Error {}
export class PasswordError extends Error {}

const sessionHours = 12;
const maxFailures = 5;
const lockMinutes = 15;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export class StaffAccounts {
  constructor(private readonly repository: StaffAccountsRepository, private readonly setupCode: string | undefined, private readonly now: () => Date = () => new Date()) {}

  async signIn(email: string, password: string): Promise<{ sessionToken: string; identity: StaffIdentity }> {
    const account = await this.repository.findActiveStaffForLogin(normalizeEmail(email));
    const locked = account?.lockedUntil && account.lockedUntil > this.now();
    const valid = await verifyPassword(password, account?.passwordHash ?? null);
    if (!account || locked) throw new SignInError(locked ? "Too many attempts. Try again in 15 minutes, or ask an administrator for a reset link." : "That email and password don't match.");
    if (!valid) {
      // A lockout that has run out starts the count again.
      const failures = (account.lockedUntil && account.lockedUntil <= this.now() ? 0 : account.failedLogins) + 1;
      await this.repository.recordFailedLogin(account.id, failures >= maxFailures ? new Date(this.now().getTime() + lockMinutes * 60_000) : null);
      throw new SignInError(failures >= maxFailures ? "Too many attempts. Try again in 15 minutes, or ask an administrator for a reset link." : "That email and password don't match.");
    }
    await this.repository.recordSuccessfulLogin(account.id);
    return { sessionToken: await this.startSession(account.id), identity: { actor: account.email, role: account.role } };
  }

  async identify(sessionToken: string | undefined): Promise<StaffIdentity | null> {
    if (!sessionToken) return null;
    const session = await this.repository.findStaffSession(hashOpaqueToken(sessionToken));
    return session ? { actor: session.actor, role: session.role } : null;
  }

  async signOut(sessionToken: string | undefined): Promise<void> { if (sessionToken) await this.repository.revokeStaffSession(hashOpaqueToken(sessionToken)); }

  /** An invitation (72 hours) or reset (24 hours) link token. Returns null when the account is not active. */
  async issuePasswordLink(email: string, purpose: PasswordLinkPurpose, createdBy: string): Promise<string | null> {
    const token = createOpaqueToken();
    const hours = purpose === "invite" ? 72 : 24;
    const created = await this.repository.createPasswordLink(normalizeEmail(email), hashOpaqueToken(token), purpose, createdBy, new Date(this.now().getTime() + hours * 3_600_000));
    return created ? token : null;
  }

  async passwordLink(token: string): Promise<{ email: string; purpose: PasswordLinkPurpose } | null> { return this.repository.findPasswordLink(hashOpaqueToken(token)); }

  /** Sets the password from a one-time link and signs the person in on this device. */
  async completePasswordLink(token: string, password: string, confirm: string): Promise<{ sessionToken: string; identity: StaffIdentity }> {
    const link = await this.passwordLink(token);
    if (!link) throw new PasswordError("This link has expired or was already used. Ask an administrator for a new one.");
    this.checkNewPassword(password, confirm, link.email);
    const account = await this.repository.setPasswordWithLink(hashOpaqueToken(token), await hashPassword(password));
    if (!account) throw new PasswordError("This link has expired or was already used. Ask an administrator for a new one.");
    return { sessionToken: await this.startSession(account.staffId), identity: { actor: account.email, role: account.role } };
  }

  /** Changes the signed-in person's password and signs out their other devices. */
  async changePassword(sessionToken: string, current: string, password: string, confirm: string): Promise<void> {
    const session = await this.repository.findStaffSession(hashOpaqueToken(sessionToken));
    if (!session) throw new PasswordError("Your session has ended. Please sign in again.");
    if (!await verifyPassword(current, await this.repository.passwordHashFor(session.staffId))) throw new PasswordError("Your current password is not right.");
    this.checkNewPassword(password, confirm, session.actor);
    await this.repository.setPassword(session.staffId, await hashPassword(password));
    await this.repository.revokeStaffSessions(session.staffId, hashOpaqueToken(sessionToken));
  }

  async setupAvailable(): Promise<boolean> { return Boolean(this.setupCode) && await this.repository.needsFirstAdministrator(); }

  /** One-time: the holder of the setup code (STAFF_ADMIN_TOKEN) creates the first administrator with a password. */
  async setUpFirstAdministrator(code: string, email: string, password: string, confirm: string): Promise<{ sessionToken: string; identity: StaffIdentity }> {
    if (!await this.setupAvailable()) throw new PasswordError("Setup is already complete. Sign in instead.");
    const expected = Buffer.from(this.setupCode!); const provided = Buffer.from(code.trim());
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw new PasswordError("That setup code is not right.");
    const normalized = normalizeEmail(email);
    if (!emailPattern.test(normalized)) throw new PasswordError("Enter a valid email address.");
    this.checkNewPassword(password, confirm, normalized);
    if (!await this.repository.createFirstAdministrator(normalized, await hashPassword(password), hashOpaqueToken(createOpaqueToken()))) throw new PasswordError("Setup is already complete. Sign in instead.");
    return this.signIn(normalized, password);
  }

  private checkNewPassword(password: string, confirm: string, email: string): void {
    if (password !== confirm) throw new PasswordError("The two passwords don't match.");
    const problem = passwordProblem(password, email);
    if (problem) throw new PasswordError(problem);
  }

  private async startSession(staffId: string): Promise<string> {
    const token = createOpaqueToken();
    await this.repository.createStaffSession(staffId, hashOpaqueToken(token), new Date(this.now().getTime() + sessionHours * 3_600_000));
    return token;
  }
}
