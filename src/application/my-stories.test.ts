import assert from "node:assert/strict";
import test from "node:test";
import { MyStories, type MyStoriesRepository } from "./my-stories.js";

class Stories implements MyStoriesRepository {
  token = ""; account = "account-1"; session = "";
  async requestMagicLink(_box: string, _email: string, token: string) { this.token = token; }
  async consumeMagicLink(token: string) { return token === this.token ? { accountId: this.account } : null; }
  async createSession(_account: string, token: string) { this.session = token; }
  async findSession(token: string) { return token === this.session ? { accountId: this.account } : null; }
  async listStories() { return [{ boxNumber: "GS-00001", fulfilmentStatus: "delivered", recipientStatus: "confirmed" }]; }
}
test("a recipient can save a story through a one-time passwordless link", async () => {
  const repository = new Stories(); const stories = new MyStories(repository);
  const link = await stories.request("box-1", "person@example.com"); const session = await stories.verify(link);
  assert.ok(session); assert.equal((await stories.stories(session))?.[0]?.boxNumber, "GS-00001");
});
test("an invalid email or magic link cannot create profile access", async () => {
  const stories = new MyStories(new Stories()); await assert.rejects(() => stories.request("box-1", "not-email")); assert.equal(await stories.verify("wrong"), null);
});
