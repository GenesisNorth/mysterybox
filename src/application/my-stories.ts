import { createOpaqueToken } from "../infrastructure/secrets.js";

export interface StorySummary { boxNumber: string; fulfilmentStatus: string; recipientStatus: string; }
export interface MyStoriesRepository {
  requestMagicLink(boxId: string, email: string, token: string): Promise<void>;
  consumeMagicLink(token: string): Promise<{ accountId: string } | null>;
  createSession(accountId: string, token: string): Promise<void>;
  findSession(token: string): Promise<{ accountId: string } | null>;
  listStories(accountId: string): Promise<StorySummary[]>;
}

export class MyStories {
  constructor(private readonly repository: MyStoriesRepository) {}
  async request(boxId: string, email: string): Promise<string> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("A valid email is required");
    const token = createOpaqueToken(); await this.repository.requestMagicLink(boxId, normalized, token); return token;
  }
  async verify(token: string): Promise<string | null> {
    const link = await this.repository.consumeMagicLink(token); if (!link) return null;
    const session = createOpaqueToken(); await this.repository.createSession(link.accountId, session); return session;
  }
  async stories(session: string | undefined): Promise<StorySummary[] | null> {
    if (!session) return null; const account = await this.repository.findSession(session); return account ? this.repository.listStories(account.accountId) : null;
  }
}
