import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { BrowserProvider, formatEther } from "ethers";
import { useAccount, useBalance, useChainId, useConnectorClient, useConnect, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  switchToSepolia,
  EXPECTED_CHAIN_ID,
  WalletInfo,
  parseTxError,
  setActiveWalletProvider,
} from "@/lib/contract";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMetaMaskConnector(connector: any): boolean {
  const id = String(connector?.id ?? "").toLowerCase();
  const name = String(connector?.name ?? "").toLowerCase();
  return id.includes("meta") || name.includes("meta");
}

interface WalletContextValue {
  wallet: WalletInfo | null;
  connecting: boolean;
  hasMetaMask: boolean;
  correctNetwork: boolean;
  walletType: string | null;
  isReadOnly: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  // wagmi state
  const { address, isConnected, isConnecting, isReconnecting, connector } = useAccount();
  const chainId = useChainId();
  const { data: balanceData } = useBalance({ address, chainId });
  const { data: connectorClient } = useConnectorClient();
  const { connectAsync, connectors } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  const [wallet, setWallet] = useState<WalletInfo | null>(null);

  // Pipe the active wallet's EIP-1193 provider into contract.ts so all
  // existing ethers writes (createAuction, placeBid, ...) use whichever
  // wallet is currently connected (MetaMask / Coinbase / WalletConnect / Rabby).
  useEffect(() => {
    let cancelled = false;
    async function syncProvider() {
      if (!isConnected || !connector) {
        setActiveWalletProvider(null);
        return;
      }
      try {
        const provider = await connector.getProvider();
        if (!cancelled) setActiveWalletProvider(provider);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[WalletContext] failed to get connector provider", e);
        setActiveWalletProvider(null);
      }
    }
    void syncProvider();
    return () => {
      cancelled = true;
    };
  }, [isConnected, connector, chainId, address]);

  // Build the legacy WalletInfo shape consumed across the app.
  useEffect(() => {
    if (!isConnected || !address) {
      setWallet(null);
      return;
    }
    const networkName = chainId === EXPECTED_CHAIN_ID ? "Sepolia" : `Chain ${chainId}`;
    const balance = balanceData
      ? parseFloat(formatEther(balanceData.value)).toFixed(4)
      : "0.0000";
    setWallet({
      address,
      network: networkName,
      chainId: chainId ?? 0,
      balance,
    });
  }, [isConnected, address, chainId, balanceData]);

  const connect = useCallback(async () => {
    try {
      if (openConnectModal) {
        openConnectModal();
        return;
      }
      // Fallback for environments where RainbowKit modal injection fails.
      const preferred =
        connectors.find((c) => isMetaMaskConnector(c)) ??
        connectors.find((c) => c.id === "injected") ??
        connectors[0];
      if (!preferred) throw new Error("Nijedan wallet konektor nije dostupan.");
      await connectAsync({ connector: preferred });
    } catch (e) {
      toast.error("Connection failed", { description: parseTxError(e) });
    }
  }, [openConnectModal, connectAsync, connectors]);

  const disconnect = useCallback(() => {
    wagmiDisconnect();
    setActiveWalletProvider(null);
    toast("Wallet disconnected");
  }, [wagmiDisconnect]);

  const switchNetwork = useCallback(async () => {
    try {
      await switchToSepolia();
      toast.success("Switched to Sepolia");
    } catch (e) {
      toast.error("Network switch failed", { description: parseTxError(e) });
    }
  }, []);

  const correctNetwork = wallet?.chainId === EXPECTED_CHAIN_ID;
  // Kept for backward-compat with WalletButton fallback path. With wagmi
  // we no longer need to gate on MetaMask presence — RainbowKit shows
  // alternative wallets (Coinbase, WalletConnect, ...) when MetaMask is
  // missing — so always report true.
  const hasMetaMask = true;
  const walletType = connector?.name ?? null;
  const isReadOnly = !isConnected;

  const value = useMemo(
    () => ({
      wallet,
      connecting: isConnecting || isReconnecting,
      hasMetaMask,
      correctNetwork,
      walletType,
      isReadOnly,
      connect,
      disconnect,
      switchNetwork,
    }),
    [wallet, isConnecting, isReconnecting, correctNetwork, walletType, isReadOnly, connect, disconnect, switchNetwork]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export const shortenAddress = (addr: string, chars = 4) =>
  addr.length > chars * 2 + 2 ? `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}` : addr;

// Re-export so legacy imports keep working without ripple changes.
export { BrowserProvider };
