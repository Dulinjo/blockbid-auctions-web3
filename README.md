# BlockBid

BlockBid is a Web3 auction prototype that combines a modern frontend with a Solidity smart contract deployed on the Sepolia test network.

The application allows users to:
- create auctions
- browse active auctions
- place bids using a wallet
- end auctions
- withdraw funds if they have been outbid

## Project Overview

The goal of the project is to demonstrate how a frontend application can interact with blockchain-based auction logic through a deployed smart contract.

The project combines:
- a modern frontend UI
- wallet integration
- blockchain transaction flow
- a Solidity smart contract
- Ethereum Sepolia testnet

## Tech Stack

### Frontend
- Lovable
- React
- TypeScript
- Tailwind CSS

### Web3 / Blockchain
- ethers.js
- MetaMask / EVM wallet
- Solidity
- Remix IDE
- Sepolia testnet

## Architecture

The application works through the following flow:

**Frontend → Wallet → Smart Contract → Sepolia**

- the frontend displays auctions and user actions
- the wallet signs blockchain transactions
- the smart contract enforces auction rules
- Sepolia stores the on-chain state

## Main Features

### Public / Guest Features
Users without a connected wallet can:
- browse the marketplace
- open auction details
- view prices, status, and end time

### Wallet-Based Features
Connected users can:
- create auctions
- place bids
- end auctions
- withdraw pending returns

## Smart Contract Logic

The Solidity smart contract manages:
- auction creation
- bid validation
- highest bid tracking
- prevention of seller self-bidding
- auction ending
- refund logic for outbid users

### Core Contract Methods

- `createAuction(string _title, uint256 _startingBid, uint256 _durationInMinutes)`
- `placeBid(uint256 _auctionId)`
- `endAuction(uint256 _auctionId)`
- `withdraw()`
- `getAuction(uint256 _auctionId)`
- `getCurrentMinBid(uint256 _auctionId)`
- `isAuctionActive(uint256 _auctionId)`
- `getTimeLeft(uint256 _auctionId)`

## Smart Contract Structure

```solidity
struct Auction {
    uint256 id;
    address payable seller;
    string title;
    uint256 startingBid;
    uint256 highestBid;
    address payable highestBidder;
    uint256 endTime;
    bool ended;
    bool exists;
}
