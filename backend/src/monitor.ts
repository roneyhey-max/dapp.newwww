import type { Config } from "./config.js";
import { TokenService } from "./token.js";

export type MonitorStatus = "READY" | "WAITING";

export async function getMonitorStatus(token: TokenService, config: Config): Promise<{ status: MonitorStatus; balance: string }> {
  const balance = await token.balanceOf(config.executorAddress);
  const threshold = await token.parseAmount(config.monitorThresholdTokens);
  return { status: balance > threshold ? "READY" : "WAITING", balance: await token.formatAmount(balance) };
}

export function startBalanceMonitor(token: TokenService, config: Config, report: (status: { status: MonitorStatus; balance: string }) => void): NodeJS.Timeout {
  const poll = async () => {
    try { report(await getMonitorStatus(token, config)); } catch (error) { report({ status: "WAITING", balance: `monitor-error: ${error instanceof Error ? error.message : "unknown"}` }); }
  };
  void poll();
  return setInterval(() => void poll(), config.monitorIntervalMs);
}
