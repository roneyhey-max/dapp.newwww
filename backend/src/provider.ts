import { JsonRpcProvider } from "ethers";
import type { Config } from "./config.js";

export function createProvider(config: Config): JsonRpcProvider {
  return new JsonRpcProvider(config.bscRpcUrl, { chainId: config.bscChainId, name: "bnb-mainnet" });
}

export async function assertMainnetProvider(provider: JsonRpcProvider): Promise<void> {
  const network = await provider.getNetwork();
  if (network.chainId !== 56n) throw new Error("BSC_RPC_URL is not connected to BNB Smart Chain Mainnet (0x38)");
}
