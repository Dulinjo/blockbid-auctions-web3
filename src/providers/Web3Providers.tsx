import { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * Wraps children with wagmi + RainbowKit.
 * QueryClientProvider is provided by App.tsx (already in place).
 */
export function Web3Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider
        modalSize="compact"
        theme={darkTheme({
          accentColor: "hsl(252 95% 65%)",
          accentColorForeground: "hsl(230 25% 6%)",
          borderRadius: "large",
          overlayBlur: "small",
        })}
      >
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
