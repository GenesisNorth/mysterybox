import { randomUUID } from "node:crypto";
import type { PasswordLinkPurpose, StaffAccountsRepository, StaffLoginRecord } from "../application/staff-accounts.js";
import type { StaffRole } from "../application/staff-operations.js";

/** Staff accounts held in memory, for tests. Mirrors the PostgreSQL rules: hashes only, one-time links, revocation. */
export class InMemoryStaffAccounts implements StaffAccountsRepository {
  readonly users = new Map<string, StaffLoginRecord & { active: boolean }>();
  private readonly sessions = new Map<string, { staffId: string; expiresAt: Date; revoked: boolean }>();
  private readonly links = new Map<string, { staffId: string; purpose: PasswordLinkPurpose; expiresAt: Date; used: boolean }>();

  addUser(email: string, role: StaffRole, passwordHash: string | null = null): string {
    const id = randomUUID();
    this.users.set(id, { id, email, role, passwordHash, failedLogins: 0, lockedUntil: null, active: true });
    return id;
  }
  /** Seeds a signed-in session for a raw token's hash. */
  addSession(staffId: string, tokenHash: string): void { this.sessions.set(tokenHash, { staffId, expiresAt: new Date(Date.now() + 3_600_000), revoked: false }); }
  private byEmail(email: string) { return [...this.users.values()].find((user) => user.email === email && user.active); }

  async findActiveStaffForLogin(email: string): Promise<StaffLoginRecord | null> { const user = this.byEmail(email); return user ? { ...user } : null; }
  async recordFailedLogin(staffId: string, lockUntil: Date | null): Promise<void> {
    const user = this.users.get(staffId)!; const expired = user.lockedUntil !== null && user.lockedUntil <= new Date();
    user.failedLogins = (expired ? 0 : user.failedLogins) + 1; user.lockedUntil = lockUntil ?? (expired ? null : user.lockedUntil);
  }
  async recordSuccessfulLogin(staffId: string): Promise<void> { const user = this.users.get(staffId)!; user.failedLogins = 0; user.lockedUntil = null; }
  async createStaffSession(staffId: string, tokenHash: string, expiresAt: Date): Promise<void> { this.sessions.set(tokenHash, { staffId, expiresAt, revoked: false }); }
  async findStaffSession(tokenHash: string): Promise<{ staffId: string; actor: string; role: StaffRole } | null> {
    const session = this.sessions.get(tokenHash); const user = session && this.users.get(session.staffId);
    return session && user?.active && !session.revoked && session.expiresAt > new Date() ? { staffId: user.id, actor: user.email, role: user.role } : null;
  }
  async revokeStaffSession(tokenHash: string): Promise<void> { const session = this.sessions.get(tokenHash); if (session) session.revoked = true; }
  async revokeStaffSessions(staffId: string, keepTokenHash?: string): Promise<void> { for (const [hash, session] of this.sessions) if (session.staffId === staffId && hash !== keepTokenHash) session.revoked = true; }
  async createPasswordLink(email: string, tokenHash: string, purpose: PasswordLinkPurpose, _createdBy: string, expiresAt: Date): Promise<boolean> {
    const user = this.byEmail(email); if (!user) return false;
    for (const link of this.links.values()) if (link.staffId === user.id) link.used = true;
    this.links.set(tokenHash, { staffId: user.id, purpose, expiresAt, used: false }); return true;
  }
  async findPasswordLink(tokenHash: string): Promise<{ email: string; purpose: PasswordLinkPurpose } | null> {
    const link = this.links.get(tokenHash); const user = link && this.users.get(link.staffId);
    return link && user?.active && !link.used && link.expiresAt > new Date() ? { email: user.email, purpose: link.purpose } : null;
  }
  async setPasswordWithLink(tokenHash: string, passwordHash: string): Promise<{ staffId: string; email: string; role: StaffRole } | null> {
    if (!await this.findPasswordLink(tokenHash)) return null;
    const link = this.links.get(tokenHash)!; link.used = true;
    const user = this.users.get(link.staffId)!; user.passwordHash = passwordHash; user.failedLogins = 0; user.lockedUntil = null;
    await this.revokeStaffSessions(user.id);
    return { staffId: user.id, email: user.email, role: user.role };
  }
  async setPassword(staffId: string, passwordHash: string): Promise<void> { this.users.get(staffId)!.passwordHash = passwordHash; }
  async passwordHashFor(staffId: string): Promise<string | null> { return this.users.get(staffId)?.passwordHash ?? null; }
  async needsFirstAdministrator(): Promise<boolean> { return ![...this.users.values()].some((user) => user.active && user.role === "admin" && user.passwordHash); }
  async createFirstAdministrator(email: string, passwordHash: string): Promise<boolean> {
    if (!await this.needsFirstAdministrator()) return false;
    const existing = [...this.users.values()].find((user) => user.email === email);
    if (existing) Object.assign(existing, { role: "admin", active: true, passwordHash, failedLogins: 0, lockedUntil: null });
    else this.addUser(email, "admin", passwordHash);
    return true;
  }
}
