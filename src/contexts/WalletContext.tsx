import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import {
  connectWallet as svcConnect,
  isMetaMaskInstalled,
  switchToSepolia,
  EXPECTED_CHAIN_ID,
  WalletInfo,
  parseTxError,
} from "@/lib/contract";
import { toast } from "sonner";

interface WalletContextValue {
  wallet: WalletInfo | null;
  connecting: boolean;
  hasMetaMask: boolean;
  correctNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [hasMetaMask, setHasMetaMask] = useState(true);

  const refreshWallet = useCallback(async () => {
    try {
      const info = await svcConnect();
      setWallet(info);
      localStorage.setItem("blockbid_wallet", JSON.stringify(info));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setHasMetaMask(isMetaMaskInstalled());
    const stored = localStorage.getItem("blockbid_wallet");
    if (stored) {
      try {
        setWallet(JSON.parse(stored));
      } catch {
        /* ignore */
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth) return;

    const onAccounts = (accounts: string[]) => {
      if (accounts.length === 0) {
        setWallet(null);
        localStorage.removeItem("blockbid_wallet");
      } else {
        refreshWallet();
      }
    };
    const onChain = () => refreshWallet();

    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [refreshWallet]);

  const connect = useCallback(async () => {
    if (!isMetaMaskInstalled()) {
      toast.error("MetaMask not detected", {
        description: "Install MetaMask to continue",
      });
      return;
    }
    setConnecting(true);
    try {
      const info = await svcConnect();
      setWallet(info);
      localStorage.setItem("blockbid_wallet", JSON.stringify(info));
      toast.success("Wallet connected", {
        description: `${info.address.slice(0, 6)}...${info.address.slice(-4)}`,
      });
      if (info.chainId !== EXPECTED_CHAIN_ID) {
        toast.warning("Wrong network", {
          description: "Please switch to Sepolia testnet",
        });
      }
    } catch (e) {
      toast.error("Connection failed", { description: parseTxError(e) });
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    localStorage.removeItem("blockbid_wallet");
    toast("Wallet disconnected");
  }, []);

  const switchNetwork = useCallback(async () => {
    try {
      await switchToSepolia();
      await refreshWallet();
      toast.success("Switched to Sepolia");
    } catch (e) {
      toast.error("Network switch failed", { description: parseTxError(e) });
    }
  }, [refreshWallet]);

  const correctNetwork = wallet?.chainId === EXPECTED_CHAIN_ID;

  return (
    <WalletContext.Provider
      value={{ wallet, connecting, hasMetaMask, correctNetwork, connect, disconnect, switchNetwork }}
    >
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
