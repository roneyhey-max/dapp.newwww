import express from "express";
import { loadConfig } from "./config.js";
import { assertMainnetProvider, createProvider } from "./provider.js";
import { createExecutorSigner } from "./executor.js";
import { TokenService } from "./token.js";
import { createExecuteTransferRouter } from "./routes/execute-transfer.js";
import { startBalanceMonitor } from "./monitor.js";
import { ExecutorContractAdapter } from "./executorContract.js";

const config = loadConfig();
async function start() {
	const provider = createProvider(config);
	await assertMainnetProvider(provider);
	const signer = createExecutorSigner(config, provider);
	const token = new TokenService(config.tokenAddress, signer);
	if (config.executorContractAddress) new ExecutorContractAdapter(config.executorContractAddress, signer);
	const app = express();
	app.use((request, response, next) => {
		const origin = request.header("origin");
		const frontendOrigin = config.frontendOrigin;
		if (origin && frontendOrigin && origin === frontendOrigin) {
			response.setHeader("Access-Control-Allow-Origin", origin);
			response.setHeader("Vary", "Origin");
			response.setHeader("Access-Control-Allow-Headers", "content-type, x-request-id");
			response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
		}
		if (request.method === "OPTIONS") return response.sendStatus(origin && origin === frontendOrigin ? 204 : 403);
		next();
	});
	app.use(express.json({ limit: "16kb" }));
	app.get("/health", (_request, response) => response.json({ status: "ok", chainId: "0x38", executor: config.executorAddress }));
	app.use(createExecuteTransferRouter({ config, provider, token, executor: signer }));
	startBalanceMonitor(token, config, (state) => console.log(JSON.stringify({ status: state.status, balance: state.balance, token: config.tokenAddress })));
	app.listen(config.port, () => console.log(`Backend executor listening on port ${config.port}`));
}

void start().catch((error: unknown) => {
	console.error(`Backend startup failed: ${error instanceof Error ? error.message : "unknown error"}`);
	process.exitCode = 1;
});
