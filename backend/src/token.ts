import { Contract, type ContractRunner, formatUnits, parseUnits } from "ethers";

export const TOKEN_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function transferFrom(address,address,uint256) returns (bool)",
];

export class TokenService {
  readonly contract: Contract;
  private decimalsValue?: number;

  constructor(readonly tokenAddress: string, runner: ContractRunner) {
    this.contract = new Contract(tokenAddress, TOKEN_ABI, runner);
  }

  async decimals(): Promise<number> {
    this.decimalsValue ??= Number(await this.contract.decimals());
    return this.decimalsValue;
  }

  async balanceOf(owner: string): Promise<bigint> {
    return this.contract.balanceOf(owner) as Promise<bigint>;
  }

  async allowance(owner: string, spender: string): Promise<bigint> {
    return this.contract.allowance(owner, spender) as Promise<bigint>;
  }

  async parseAmount(amount: string): Promise<bigint> {
    return parseUnits(amount, await this.decimals());
  }

  async formatAmount(amount: bigint): Promise<string> {
    return formatUnits(amount, await this.decimals());
  }

  async transferFrom(owner: string, recipient: string, amount: bigint): Promise<{ hash: string; wait: () => Promise<{ status?: number } | null> }> {
    return this.contract.transferFrom(owner, recipient, amount) as Promise<{ hash: string; wait: () => Promise<{ status?: number } | null> }>;
  }
}
