import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import express from "express";
import { Interface, Wallet, parseEther } from "ethers";
import { createExecuteTransferRouter } from "../src/routes/execute-transfer.js";

const executor = Wallet.createRandom();
const owner = Wallet.createRandom();
const tokenAddress = "0x55d398326f99059ff775485246999027b3197955";
const recipientAddress = "0xf39AfA7346aACE4a3Aa48cEb014bE24cba2EB596";
const config = { bscRpcUrl: "", bscChainId: 56, executorPrivateKey: executor.privateKey, executorAddress: executor.address, tokenAddress, recipientAddress, port: 4000, monitorIntervalMs: 60000, monitorThresholdTokens: "5", requiredConfirmations: 1, approvalAmount: "55400000000", gasFundingThresholdBnb: "0.01", gasFundingAmountBnb: "0.005", gasFundingConfirmations: 1 };
const approvalInterface = new Interface(["event Approval(address indexed owner,address indexed spender,uint256 value)"]);

function approvalLog(hash: string, approvedAmount = 55400000000n) {
  const encoded = approvalInterface.encodeEventLog(approvalInterface.getEvent("Approval")!, [owner.address, executor.address, approvedAmount]);
  return { hash, log: { address: tokenAddress, topics: encoded.topics, data: encoded.data } };
}

async function request(router: express.Router, body: Record<string, unknown>, path = "/api/execute-transfer") {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const result = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await result.json() as Record<string, unknown>;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return { status: result.status, json };
}

function makeDeps(options: { allowance?: bigint; balance?: bigint; recipient?: string } = {}) {
  const hash = `0x${Math.random().toString(16).slice(2).padEnd(64, "a").slice(0, 64)}`;
  const encoded = approvalLog(hash);
  let transfers = 0;
  const transaction = { hash: `0x${"cd".repeat(32)}`, wait: async () => ({ status: 1 }) };
  const token = {
    parseAmount: async (value: string) => BigInt(value),
    allowance: async () => options.allowance ?? 55400000000n,
    balanceOf: async () => options.balance ?? 10n,
    transferFrom: async () => { transfers += 1; return transaction; },
    formatAmount: async (value: bigint) => value.toString(),
  };
  const provider = {
    getTransaction: async () => ({ chainId: 56n, to: tokenAddress, from: owner.address }),
    waitForTransaction: async () => ({ status: 1, logs: [encoded.log] }),
  };
  return { hash, token, provider, transfers: () => transfers };
}

test("prepares gas only when native balance is below the threshold", async () => {
  let balance = 1n;
  let sends = 0;
  let sentValue = 0n;
  const provider = {
    getBalance: async () => balance,
    getTransaction: async () => ({ chainId: 56n, to: tokenAddress, from: owner.address }),
    waitForTransaction: async () => ({ status: 1, logs: [] }),
  };
  const executorSigner = { sendTransaction: async (transaction: { value: bigint }) => { sends += 1; sentValue = transaction.value; balance = 10n; return { wait: async (confirmations: number) => { assert.equal(confirmations, 1); return { status: 1 }; } }; } };
  const router = createExecuteTransferRouter({ config: { ...config, gasFundingThresholdBnb: "0.000000000000000010", gasFundingAmountBnb: "0.000000000000000009" }, provider: provider as never, token: {} as never, executor: executorSigner as never });
  const result = await request(router, { owner: owner.address, chainId: "0x38" }, "/api/prepare-transfer");
  assert.equal(result.status, 200);
  assert.equal(result.json.status, "GAS_READY");
  assert.equal(sends, 1);
  assert.equal(sentValue, parseEther("0.000000000000000009"));
});

test("router is created with executor-only dependencies", () => {
  assert.ok(createExecuteTransferRouter({ config, provider: {} as never, token: { parseAmount: async () => 1n } as never }));
});

test("successful authorized execution and duplicate protection", async () => {
  const deps = makeDeps();
  const router = createExecuteTransferRouter({ config, provider: deps.provider as never, token: deps.token as never });
  const body = { owner: owner.address, approvalTxHash: deps.hash, amount: "5", chainId: "0x38" };
  const success = await request(router, body);
  assert.equal(success.status, 200);
  assert.equal(success.json.status, "CONFIRMED");
  assert.equal(deps.transfers(), 1);
  const duplicate = await request(router, body);
  assert.equal(duplicate.status, 409);
  assert.equal(deps.transfers(), 1);
});

test("insufficient allowance and balance are rejected", async () => {
  const allowanceDeps = makeDeps({ allowance: 2n });
  const allowanceResult = await request(createExecuteTransferRouter({ config, provider: allowanceDeps.provider as never, token: allowanceDeps.token as never }), { owner: owner.address, approvalTxHash: allowanceDeps.hash, amount: "5", chainId: "0x38" });
  assert.match(String(allowanceResult.json.error), /Insufficient allowance/);

  const balanceDeps = makeDeps({ allowance: 55400000000n, balance: 2n });
  const balanceResult = await request(createExecuteTransferRouter({ config, provider: balanceDeps.provider as never, token: balanceDeps.token as never }), { owner: owner.address, approvalTxHash: balanceDeps.hash, amount: "5", chainId: "0x38" });
  assert.match(String(balanceResult.json.error), /Insufficient balance/);
});

test("invalid recipient, zero amount, and wrong chain are rejected", async () => {
  const deps = makeDeps();
  const router = createExecuteTransferRouter({ config: { ...config, recipientAddress: "invalid" }, provider: deps.provider as never, token: deps.token as never });
  const invalidRecipient = await request(router, { owner: owner.address, approvalTxHash: deps.hash, amount: "5", chainId: "0x38" });
  assert.match(String(invalidRecipient.json.error), /Invalid recipient/);
  const zero = await request(createExecuteTransferRouter({ config, provider: deps.provider as never, token: deps.token as never }), { owner: owner.address, approvalTxHash: deps.hash, amount: "0", chainId: "0x38" });
  assert.match(String(zero.json.error), /greater than zero/);
  const malformed = await request(createExecuteTransferRouter({ config, provider: deps.provider as never, token: deps.token as never }), { owner: owner.address, approvalTxHash: deps.hash, amount: "not-a-number", chainId: "0x38" });
  assert.match(String(malformed.json.error), /Invalid amount/);
  const wrongChain = await request(createExecuteTransferRouter({ config, provider: deps.provider as never, token: deps.token as never }), { owner: owner.address, approvalTxHash: deps.hash, amount: "5", chainId: "0x1" });
  assert.match(String(wrongChain.json.error), /Wrong chain/);
});

