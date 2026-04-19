import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Web3Providers } from "@/providers/Web3Providers";
import { WalletProvider } from "@/contexts/WalletContext";
import Index from "./pages/Index.tsx";
import Marketplace from "./pages/Marketplace.tsx";
import AuctionDetails from "./pages/AuctionDetails.tsx";
import CreateAuction from "./pages/CreateAuction.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import ContractInfo from "./pages/ContractInfo.tsx";
import NotFound from "./pages/NotFound.tsx";
import AuctionTest from "./components/AuctionTest";
import Debug from "./pages/Debug.tsx";
import { TxDebugPanel } from "./components/TxDebugPanel";
import { AIAssistant } from "./components/AIAssistant";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Web3Providers>
      <WalletProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner theme="dark" />
          <BrowserRouter>
            <TxDebugPanel />
            <AIAssistant />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/auction/:id" element={<AuctionDetails />} />
              <Route path="/create" element={<CreateAuction />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/contract" element={<ContractInfo />} />
              <Route path="/demo" element={<AuctionTest />} />
              <Route path="/debug" element={<Debug />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </WalletProvider>
    </Web3Providers>
  </QueryClientProvider>
);

export default App;
