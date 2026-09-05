import { Wallet, type JsonRpcProvider } from "ethers";
import type { Config } from "./config.js";

export function createExecutorSigner(config: Config, provider: JsonRpcProvider): Wallet {
  const signer = new Wallet(config.executorPrivateKey, provider);
  if (signer.address.toLowerCase() !== config.executorAddress.toLowerCase()) {
    throw new Error("Derived executor address does not match configured EXECUTOR_ADDRESS");
  }
  return signer;
}
