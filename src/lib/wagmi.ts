/**
 * wagmi + RainbowKit configuration.
 *
 * Supports MetaMask, Coinbase Wallet, WalletConnect, Rainbow, and any
 * EIP-6963 / injected EVM wallet. Sepolia is the only supported chain.
 *
 * NOTE: WalletConnect requires a free projectId from https://cloud.reown.com.
 * The placeholder below works for demos but mobile QR connections will fail
 * until you replace it with your own. Stored as a constant (publishable key,
 * safe to ship in client code).
 */
import { http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

// Replace with a real projectId from cloud.reown.com to enable WalletConnect.
// Browser-safe (publishable). MetaMask, Coinbase, and injected wallets work
// without a valid projectId — only the WalletConnect mobile QR path requires it.
export const WALLETCONNECT_PROJECT_ID = "3fbb6bba6f1de962d911bb5b5c9dba88";

const SEPOLIA_RPCS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://1rpc.io/sepolia",
];

export const wagmiConfig = getDefaultConfig({
  appName: "BlockBid",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPCS[0]),
  },
  ssr: false,
});

export const SUPPORTED_CHAIN_ID = sepolia.id;
