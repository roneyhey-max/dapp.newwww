import { Contract, type ContractRunner } from "ethers";

// Explicit adapter only. It supports one named transfer operation and no arbitrary calldata.
const EXECUTOR_CONTRACT_ABI = [
  "function executeTransfer(address token,address owner,address recipient,uint256 amount) returns (bytes32)",
];

export class ExecutorContractAdapter {
  private readonly contract: Contract;

  constructor(address: string, runner: ContractRunner) {
    this.contract = new Contract(address, EXECUTOR_CONTRACT_ABI, runner);
  }

  executeTransfer(token: string, owner: string, recipient: string, amount: bigint) {
    return this.contract.executeTransfer(token, owner, recipient, amount) as Promise<{ hash: string; wait: () => Promise<{ status?: number } | null> }>;
  }
}
