import { getAddress, isAddress, isHexString } from "ethers";

export interface ExecuteTransferInput {
  owner: string;
  approvalTxHash: string;
  amount: string;
  chainId: string | number;
}

export interface PrepareTransferInput {
  owner: string;
  chainId: string | number;
}

export function validateAddress(value: string, field: string): string {
  if (!isAddress(value)) throw new Error(`Invalid ${field}`);
  return getAddress(value);
}

export function validateTransactionHash(value: string): string {
  if (!isHexString(value, 32)) throw new Error("Invalid approval transaction hash");
  return value;
}

export function validateAmount(value: string): string {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) throw new Error("Invalid amount");
  if (Number(value) <= 0) throw new Error("Amount must be greater than zero");
  return value;
}

export function validateChainId(value: string | number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (numeric !== 56 && value !== "0x38") throw new Error("Wrong chain: BNB Smart Chain Mainnet (0x38) is required");
  return 56;
}

export function validateExecuteInput(input: unknown): ExecuteTransferInput {
  if (!input || typeof input !== "object") throw new Error("Request body is required");
  const body = input as Record<string, unknown>;
  if (typeof body.owner !== "string" || typeof body.approvalTxHash !== "string" || typeof body.amount !== "string" || (typeof body.chainId !== "string" && typeof body.chainId !== "number")) throw new Error("owner, approvalTxHash, amount, and chainId are required");
  return {
    owner: validateAddress(body.owner, "owner"),
    approvalTxHash: validateTransactionHash(body.approvalTxHash),
    amount: validateAmount(body.amount),
    chainId: body.chainId,
  };
}

export function validatePrepareInput(input: unknown): PrepareTransferInput {
  if (!input || typeof input !== "object") throw new Error("Request body is required");
  const body = input as Record<string, unknown>;
  if (typeof body.owner !== "string" || (typeof body.chainId !== "string" && typeof body.chainId !== "number")) throw new Error("owner and chainId are required");
  return { owner: validateAddress(body.owner, "owner"), chainId: body.chainId };
}
