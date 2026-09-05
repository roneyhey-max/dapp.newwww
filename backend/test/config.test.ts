import assert from "node:assert/strict";
import { test } from "node:test";
import { Wallet } from "ethers";
import { loadConfig } from "../src/config.js";

const wallet = Wallet.createRandom();
const base = { BSC_RPC_URL: "https://example.invalid", BSC_CHAIN_ID: "0x38", EXECUTOR_PRIVATE_KEY: wallet.privateKey, EXECUTOR_ADDRESS: wallet.address, TOKEN_ADDRESS: "0x0000000000000000000000000000000000000001", RECIPIENT_ADDRESS: "0x0000000000000000000000000000000000000002", APPROVAL_AMOUNT: "55400000000", GAS_FUNDING_THRESHOLD_BNB: "0.01", GAS_FUNDING_AMOUNT_BNB: "0.0005" };

test("valid executor configuration", () => {
	const config = loadConfig(base);
	assert.equal(config.executorAddress, wallet.address);
	assert.equal(config.gasFundingAmountBnb, "0.0005");
});
test("executor address mismatch fails safely", () => assert.throws(() => loadConfig({ ...base, EXECUTOR_ADDRESS: "0x0000000000000000000000000000000000000003" }), /does not match/));
