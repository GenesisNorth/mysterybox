import assert from "node:assert/strict";
import test from "node:test";
import { hashOpaqueToken } from "./secrets.js";

test("opaque-token hashes are deterministic and never equal the source token", () => {
  const token = "a-real-secret-token";
  assert.equal(hashOpaqueToken(token), hashOpaqueToken(token));
  assert.notEqual(hashOpaqueToken(token), token);
});
