import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Wallet, AlertTriangle } from "lucide-react";

/**
 * Multi-wallet connect button using RainbowKit's headless render-prop API,
 * styled with our design system tokens. Supports MetaMask, Coinbase Wallet,
 * WalletConnect, Rainbow, Rabby and any EIP-6963 injected wallet.
 */
export const WalletButton = () => {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {!connected ? (
              <Button
                onClick={openConnectModal}
                className="bg-gradient-primary hover:opacity-90 text-primary-foreground font-semibold shadow-lg glow-primary"
              >
                <Wallet className="mr-2 h-4 w-4" />
                Connect Wallet
              </Button>
            ) : chain.unsupported ? (
              <Button
                onClick={openChainModal}
                variant="outline"
                className="border-warning/40 text-warning hover:bg-warning/10"
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Wrong network
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  onClick={openChainModal}
                  variant="outline"
                  size="sm"
                  className="border-border bg-card/60 backdrop-blur text-xs gap-2 hidden sm:inline-flex"
                >
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse-glow" />
                  {chain.name}
                </Button>
                <Button
                  onClick={openAccountModal}
                  variant="outline"
                  className="border-border bg-card/60 backdrop-blur font-mono text-xs gap-2"
                >
                  {account.displayName}
                  {account.displayBalance ? (
                    <span className="text-muted-foreground hidden md:inline">
                      · {account.displayBalance}
                    </span>
                  ) : null}
                </Button>
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};
