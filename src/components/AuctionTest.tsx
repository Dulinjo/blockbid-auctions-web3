import { useEffect, useState } from "react";
import {
  connectWallet,
  shortAddress,
  getAuctionCount,
  getAllAuctions,
  createAuction,
  placeBid,
  endAuction,
  withdrawFunds,
  getCurrentMinBid,
  getPendingReturns,
} from "@/lib/contract";

type Auction = {
  id: number;
  seller: string;
  title: string;
  startingBidWei: string;
  startingBidEth: string;
  highestBidWei: string;
  highestBidEth: string;
  highestBidder: string;
  endTime: number;
  ended: boolean;
};

export default function AuctionTest() {
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState("");
  const [count, setCount] = useState<number>(0);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [pendingEth, setPendingEth] = useState("0.0");

  const [title, setTitle] = useState("Test aukcija");
  const [startingBid, setStartingBid] = useState("0.01");
  const [duration, setDuration] = useState("30");

  const [bidAuctionId, setBidAuctionId] = useState("1");
  const [bidAmount, setBidAmount] = useState("0.02");

  const [endAuctionId, setEndAuctionId] = useState("1");
  const [minBid, setMinBid] = useState("");

  const loadAll = async () => {
    try {
      setStatus("Učitavanje aukcija...");
      const [auctionCount, list] = await Promise.all([
        getAuctionCount(),
        getAllAuctions(),
      ]);
      setCount(auctionCount);
      setAuctions(list as Auction[]);
      setStatus("Aukcije učitane.");
    } catch (e: any) {
      setStatus(e.message || "Greška pri učitavanju.");
    }
  };

  const loadPending = async (address: string) => {
    try {
      const result = await getPendingReturns(address);
      setPendingEth(result.eth);
    } catch {
      setPendingEth("0.0");
    }
  };

  const handleConnect = async () => {
    try {
      const { address } = await connectWallet();
      setWallet(address);
      setStatus("Wallet povezan.");
      await loadPending(address);
    } catch (e: any) {
      setStatus(e.message || "Greška pri povezivanju walleta.");
    }
  };

  const handleCreateAuction = async () => {
    try {
      setStatus("Kreiranje aukcije...");
      await createAuction(title, startingBid, Number(duration));
      setStatus("Aukcija uspešno kreirana.");
      await loadAll();
    } catch (e: any) {
      setStatus(e.message || "Greška pri kreiranju aukcije.");
    }
  };

  const handleCheckMinBid = async () => {
    try {
      const result = await getCurrentMinBid(Number(bidAuctionId));
      setMinBid(result.eth);
      setStatus("Minimalna sledeća ponuda učitana.");
    } catch (e: any) {
      setStatus(e.message || "Greška pri čitanju minimalne ponude.");
    }
  };

  const handlePlaceBid = async () => {
    try {
      setStatus("Slanje ponude...");
      await placeBid(Number(bidAuctionId), bidAmount);
      setStatus("Ponuda uspešno poslata.");
      await loadAll();
      if (wallet) await loadPending(wallet);
    } catch (e: any) {
      setStatus(e.message || "Greška pri slanju ponude.");
    }
  };

  const handleEndAuction = async () => {
    try {
      setStatus("Zatvaranje aukcije...");
      await endAuction(Number(endAuctionId));
      setStatus("Aukcija uspešno završena.");
      await loadAll();
    } catch (e: any) {
      setStatus(e.message || "Greška pri završavanju aukcije.");
    }
  };

  const handleWithdraw = async () => {
    try {
      setStatus("Povlačenje sredstava...");
      await withdrawFunds();
      setStatus("Sredstva uspešno povučena.");
      if (wallet) await loadPending(wallet);
    } catch (e: any) {
      setStatus(e.message || "Greška pri povlačenju sredstava.");
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="rounded-2xl border p-6">
        <h1 className="text-3xl font-bold">BlockBid Sepolia Demo</h1>
        <p className="mt-2 text-sm opacity-80">
          Smart contract povezan na Sepolia mrežu.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={handleConnect} className="rounded-xl border px-4 py-2">
            {wallet ? `Connected: ${shortAddress(wallet)}` : "Connect MetaMask"}
          </button>

          <button onClick={loadAll} className="rounded-xl border px-4 py-2">
            Refresh Auctions
          </button>
        </div>

        <p className="mt-4 text-sm">Ukupan broj aukcija: {count}</p>
        {wallet && (
          <p className="mt-1 text-sm">
            Pending returns za tvoj wallet: {pendingEth} ETH
          </p>
        )}
        <p className="mt-3 text-sm">{status}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border p-6 space-y-3">
          <h2 className="text-xl font-semibold">Create Auction</h2>
          <input
            className="w-full rounded-xl border p-3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Naziv aukcije"
          />
          <input
            className="w-full rounded-xl border p-3"
            value={startingBid}
            onChange={(e) => setStartingBid(e.target.value)}
            placeholder="Početna cena u ETH, npr 0.01"
          />
          <input
            className="w-full rounded-xl border p-3"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Trajanje u minutima"
          />
          <button onClick={handleCreateAuction} className="rounded-xl border px-4 py-2">
            Create Auction
          </button>
        </div>

        <div className="rounded-2xl border p-6 space-y-3">
          <h2 className="text-xl font-semibold">Place Bid</h2>
          <input
            className="w-full rounded-xl border p-3"
            value={bidAuctionId}
            onChange={(e) => setBidAuctionId(e.target.value)}
            placeholder="Auction ID"
          />
          <input
            className="w-full rounded-xl border p-3"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder="Iznos ponude u ETH, npr 0.02"
          />
          <div className="flex gap-3">
            <button onClick={handleCheckMinBid} className="rounded-xl border px-4 py-2">
              Check Min Bid
            </button>
            <button onClick={handlePlaceBid} className="rounded-xl border px-4 py-2">
              Place Bid
            </button>
          </div>
          {minBid && <p className="text-sm">Minimalna sledeća ponuda: {minBid} ETH</p>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border p-6 space-y-3">
          <h2 className="text-xl font-semibold">End Auction</h2>
          <input
            className="w-full rounded-xl border p-3"
            value={endAuctionId}
            onChange={(e) => setEndAuctionId(e.target.value)}
            placeholder="Auction ID"
          />
          <button onClick={handleEndAuction} className="rounded-xl border px-4 py-2">
            End Auction
          </button>
        </div>

        <div className="rounded-2xl border p-6 space-y-3">
          <h2 className="text-xl font-semibold">Withdraw</h2>
          <p className="text-sm">
            Ako si prethodno bio nadmašen, ovde možeš da povučeš sredstva.
          </p>
          <button onClick={handleWithdraw} className="rounded-xl border px-4 py-2">
            Withdraw Funds
          </button>
        </div>
      </div>

      <div className="rounded-2xl border p-6">
        <h2 className="text-xl font-semibold">Auctions</h2>

        <div className="mt-4 grid gap-4">
          {auctions.length === 0 ? (
            <p className="text-sm opacity-70">Nema aukcija.</p>
          ) : (
            auctions.map((auction) => (
              <div key={auction.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">
                    #{auction.id} — {auction.title}
                  </h3>
                  <span className="rounded-full border px-3 py-1 text-xs">
                    {auction.ended ? "Ended" : "Active"}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm">
                  <p>Seller: {shortAddress(auction.seller)}</p>
                  <p>Starting bid: {auction.startingBidEth} ETH</p>
                  <p>Highest bid: {auction.highestBidEth} ETH</p>
                  <p>
                    Highest bidder:{" "}
                    {auction.highestBidder === "0x0000000000000000000000000000000000000000"
                      ? "Nema ponuda"
                      : shortAddress(auction.highestBidder)}
                  </p>
                  <p>End time: {new Date(auction.endTime * 1000).toLocaleString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}