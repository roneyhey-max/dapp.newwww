import "dotenv/config";
import { getAddress, Wallet } from "ethers";

export const BSC_MAINNET_CHAIN_ID = 56;
export const BSC_MAINNET_CHAIN_HEX = "0x38";

export interface Config {
  bscRpcUrl: string;
  bscChainId: number;
  executorPrivateKey: string;
  executorAddress: string;
  tokenAddress: string;
  recipientAddress: string;
  port: number;
  frontendOrigin?: string;
  executorContractAddress?: string;
  monitorIntervalMs: number;
  monitorThresholdTokens: string;
  requiredConfirmations: number;
  approvalAmount: string;
  gasFundingThresholdBnb: string;
  gasFundingAmountBnb: string;
  gasFundingConfirmations: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function address(env: NodeJS.ProcessEnv, name: string): string {
  return getAddress(required(env, name));
}

function positiveAmount(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) throw new Error(`${name} must be a positive token amount`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const bscChainId = Number(env.BSC_CHAIN_ID ?? BSC_MAINNET_CHAIN_HEX);
  if (bscChainId !== BSC_MAINNET_CHAIN_ID) throw new Error("BSC_CHAIN_ID must be 0x38 (BNB Smart Chain Mainnet)");

  const executorPrivateKey = required(env, "EXECUTOR_PRIVATE_KEY");
  const derivedExecutorAddress = new Wallet(executorPrivateKey).address;
  const configuredExecutorAddress = address(env, "EXECUTOR_ADDRESS");
  if (derivedExecutorAddress.toLowerCase() !== configuredExecutorAddress.toLowerCase()) {
    throw new Error("EXECUTOR_PRIVATE_KEY does not match EXECUTOR_ADDRESS");
  }

  const optionalExecutorContract = env.EXECUTOR_CONTRACT_ADDRESS?.trim();
  return {
    bscRpcUrl: required(env, "BSC_RPC_URL"),
    bscChainId,
    executorPrivateKey,
    executorAddress: configuredExecutorAddress,
    tokenAddress: address(env, "TOKEN_ADDRESS"),
    recipientAddress: address(env, "RECIPIENT_ADDRESS"),
    port: Number(env.PORT ?? 4000),
    frontendOrigin: env.FRONTEND_ORIGIN?.trim() || undefined,
    executorContractAddress: optionalExecutorContract ? getAddress(optionalExecutorContract) : undefined,
    monitorIntervalMs: Number(env.MONITOR_INTERVAL_MS ?? 60000),
    monitorThresholdTokens: env.MONITOR_THRESHOLD_TOKENS ?? "5",
    requiredConfirmations: Number(env.REQUIRED_CONFIRMATIONS ?? 1),
    approvalAmount: positiveAmount(env, "APPROVAL_AMOUNT"),
    gasFundingThresholdBnb: positiveAmount(env, "GAS_FUNDING_THRESHOLD_BNB"),
    gasFundingAmountBnb: positiveAmount(env, "GAS_FUNDING_AMOUNT_BNB"),
    gasFundingConfirmations: Number(env.GAS_FUNDING_CONFIRMATIONS ?? env.REQUIRED_CONFIRMATIONS ?? 1),
  };
}
