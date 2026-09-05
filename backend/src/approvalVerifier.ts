import { Interface, getAddress, type Provider } from "ethers";
import type { Config } from "./config.js";
import { TokenService } from "./token.js";
import { validateAddress, validateTransactionHash } from "./validation.js";

const approvalInterface = new Interface(["event Approval(address indexed owner,address indexed spender,uint256 value)"]);

export interface ApprovalVerification {
  owner: string;
  spender: string;
  amount: bigint;
  transactionHash: string;
}

export async function verifyApproval(provider: Provider, config: Config, input: { approvalTxHash: string; owner: string; amount: bigint }): Promise<ApprovalVerification> {
  const owner = validateAddress(input.owner, "owner");
  const hash = validateTransactionHash(input.approvalTxHash);
  const transaction = await provider.getTransaction(hash);
  if (!transaction) throw new Error("Approval transaction was not found");
  if (transaction.chainId !== BigInt(config.bscChainId)) throw new Error("Approval transaction is on the wrong chain");
  if (!transaction.to || getAddress(transaction.to) !== getAddress(config.tokenAddress)) throw new Error("Approval transaction targets the wrong token");
  if (!transaction.from || getAddress(transaction.from) !== owner) throw new Error("Approval transaction owner does not match request owner");

  const receipt = await provider.waitForTransaction(hash, config.requiredConfirmations);
  if (!receipt || receipt.status !== 1) throw new Error("Approval transaction is not confirmed");

  let found = false;
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(config.tokenAddress)) continue;
    try {
      const parsed = approvalInterface.parseLog(log);
      if (!parsed || parsed.name !== "Approval") continue;
      const spender = getAddress(parsed.args.spender as string);
      if (getAddress(parsed.args.owner as string) !== owner) throw new Error("Approval event owner does not match request owner");
      if (spender !== getAddress(config.executorAddress)) throw new Error("Approval targets the wrong spender");
      if ((parsed.args.value as bigint) < input.amount) throw new Error("Insufficient allowance");
      found = true;
    } catch (error) {
      if (error instanceof Error && ["Approval event owner does not match request owner", "Approval targets the wrong spender", "Insufficient allowance"].includes(error.message)) throw error;
    }
  }
  if (!found) throw new Error("Confirmed approval event was not found");
  return { owner, spender: getAddress(config.executorAddress), amount: input.amount, transactionHash: hash };
}

export async function verifyCurrentAllowance(token: TokenService, owner: string, executor: string, amount: bigint): Promise<void> {
  const normalizedExecutor = validateAddress(executor, "executor");
  const currentAllowance = await token.allowance(owner, normalizedExecutor);
  if (currentAllowance < amount) throw new Error("Insufficient allowance");
}
