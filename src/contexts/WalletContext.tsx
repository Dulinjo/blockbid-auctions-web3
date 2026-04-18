import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { connectWallet as svcConnect, isMetaMaskInstalled, WalletInfo } from "@/services/blockchain";
import { toast } from "sonner";

interface WalletContextValue {
  wallet: WalletInfo | null;
  connecting: boolean;
  hasMetaMask: boolean;
  correctNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const EXPECTED_CHAIN_ID = 11155111; // Sepolia

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [hasMetaMask, setHasMetaMask] = useState(true);

  useEffect(() => {
    setHasMetaMask(isMetaMaskInstalled() || true); // demo: always true
    const stored = localStorage.getItem("blockbid_wallet");
    if (stored) {
      try {
        setWallet(JSON.parse(stored));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const info = await svcConnect();
      setWallet(info);
      localStorage.setItem("blockbid_wallet", JSON.stringify(info));
      toast.success("Wallet connected", {
        description: `${info.address.slice(0, 6)}...${info.address.slice(-4)}`,
      });
    } catch (e) {
      toast.error("Connection rejected", {
        description: e instanceof Error ? e.message : "Please try again",
      });
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    localStorage.removeItem("blockbid_wallet");
    toast("Wallet disconnected");
  }, []);

  const correctNetwork = wallet?.chainId === EXPECTED_CHAIN_ID;

  return (
    <WalletContext.Provider value={{ wallet, connecting, hasMetaMask, correctNetwork, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export const shortenAddress = (addr: string, chars = 4) =>
  addr.length > chars * 2 + 2 ? `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}` : addr;
