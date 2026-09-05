import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAddress, validateAmount, validateChainId, validateTransactionHash } from "../src/validation.js";

test("valid addresses, hash, amount, and chain", () => {
  assert.equal(validateAddress("0x0000000000000000000000000000000000000001", "owner"), "0x0000000000000000000000000000000000000001");
  assert.equal(validateTransactionHash(`0x${"ab".repeat(32)}`).length, 66);
  assert.equal(validateAmount("5.25"), "5.25");
  assert.equal(validateChainId("0x38"), 56);
});

test("reject invalid recipient, zero amount, and wrong chain", () => {
  assert.throws(() => validateAddress("bad", "recipient"), /Invalid recipient/);
  assert.throws(() => validateAmount("0"), /greater than zero/);
  assert.throws(() => validateChainId("0x1"), /Wrong chain/);
});
