import assert from "node:assert/strict";
import { test } from "node:test";
import { Interface, Wallet } from "ethers";
import { verifyApproval } from "../src/approvalVerifier.js";

const token = "0x0000000000000000000000000000000000000001";
const executor = Wallet.createRandom();
const owner = Wallet.createRandom();
const approvalInterface = new Interface(["event Approval(address indexed owner,address indexed spender,uint256 value)"]);
const hash = `0x${"ab".repeat(32)}`;
const config = { bscRpcUrl: "", bscChainId: 56, executorPrivateKey: executor.privateKey, executorAddress: executor.address, tokenAddress: token, recipientAddress: "0x0000000000000000000000000000000000000002", port: 4000, monitorIntervalMs: 60000, monitorThresholdTokens: "5", requiredConfirmations: 1, approvalAmount: "55400000000", gasFundingThresholdBnb: "0.01", gasFundingAmountBnb: "0.005", gasFundingConfirmations: 1 };
function providerFor(logs: unknown[], overrides: Record<string, unknown> = {}) { return { getTransaction: async () => ({ chainId: 56n, to: token, from: owner.address }), waitForTransaction: async () => ({ status: 1, logs, ...overrides }) } as never; }
const log = approvalInterface.encodeEventLog(approvalInterface.getEvent("Approval")!, [owner.address, executor.address, 100n]);
const tokenLog = { address: token, topics: log.topics, data: log.data };

test("valid approval", async () => assert.equal((await verifyApproval(providerFor([tokenLog]), config, { approvalTxHash: hash, owner: owner.address, amount: 50n })).spender, executor.address));
test("invalid approval transaction", async () => await assert.rejects(() => verifyApproval(providerFor([], { status: 0 }), config, { approvalTxHash: hash, owner: owner.address, amount: 50n }), /not confirmed|event/));
test("wrong token", async () => await assert.rejects(() => verifyApproval(providerFor([tokenLog]), { ...config, tokenAddress: "0x0000000000000000000000000000000000000004" }, { approvalTxHash: hash, owner: owner.address, amount: 50n }), /wrong token/));
test("wrong spender", async () => { const wrong = approvalInterface.encodeEventLog(approvalInterface.getEvent("Approval")!, [owner.address, Wallet.createRandom().address, 100n]); await assert.rejects(() => verifyApproval(providerFor([{ address: token, topics: wrong.topics, data: wrong.data }]), config, { approvalTxHash: hash, owner: owner.address, amount: 50n }), /wrong spender/); });
test("wrong owner", async () => await assert.rejects(() => verifyApproval(providerFor([tokenLog]), config, { approvalTxHash: hash, owner: Wallet.createRandom().address, amount: 50n }), /owner does not match/));
