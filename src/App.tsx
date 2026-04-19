import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <WalletProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner theme="dark" />
        <BrowserRouter>
          <TxDebugPanel />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/auction/:id" element={<AuctionDetails />} />
            <Route path="/create" element={<CreateAuction />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/contract" element={<ContractInfo />} />
            <Route path="/demo" element={<AuctionTest />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </WalletProvider>
  </QueryClientProvider>
);

export default App;
