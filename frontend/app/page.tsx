'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from '@coinbase/onchainkit/wallet';
import {
  Address,
  Avatar,
  Name,
  Identity,
} from '@coinbase/onchainkit/identity';
import { API_URL } from '@/lib/config';

interface ChainResult {
  chainId: number;
  name: string;
  tokens: { symbol: string; balance: number; usdValue: number }[];
  totalUSD: number;
}

interface ScanResult {
  chains: ChainResult[];
  totalRecoverable: number;
  chainCount: number;
}

interface EstimateResult {
  grossAmount: number;
  fees: { total: number };
  netAmount: number;
  worthIt: boolean;
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [targetAsset, setTargetAsset] = useState<'USDC' | 'ETH'>('USDC');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleScan = async () => {
    if (!address) return;
    setIsScanning(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, targetAsset }),
      });
      const data = await res.json();

      if (data.success) {
        setScanResult(data.data.scan);
        setEstimate(data.data.estimate);
      } else {
        setError(data.error || 'Scan failed');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleConsolidate = async () => {
    if (!address) return;
    setIsConsolidating(true);

    try {
      const res = await fetch(`${API_URL}/api/consolidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, targetAsset }),
      });
      const data = await res.json();

      if (data.success) {
        // Simulate processing
        await new Promise((r) => setTimeout(r, 3000));
        setSuccess(true);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Consolidation failed');
    } finally {
      setIsConsolidating(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full border-2 border-green-500 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl text-green-500">✓</span>
          </div>
          <h1 className="text-4xl font-light text-white mb-2">
            ${estimate?.netAmount.toFixed(2)}
          </h1>
          <p className="text-sm text-gray-400 mb-8">Consolidated to Base ({targetAsset})</p>
          <button
            onClick={() => {
              setSuccess(false);
              setScanResult(null);
              setEstimate(null);
            }}
            className="btn-primary"
          >
            Done
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col p-6 max-w-md mx-auto">
      {/* Header */}
      <header className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-light text-white tracking-wide">Dust</h1>
          <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">
            {isConnected ? 'Ready to scan' : 'Connect wallet'}
          </p>
        </div>
        <Wallet>
          <ConnectWallet>
            <Avatar className="w-8 h-8" />
            <Name />
          </ConnectWallet>
          <WalletDropdown>
            <Identity className="px-4 py-2" hasCopyAddressOnClick>
              <Avatar />
              <Name />
              <Address />
            </Identity>
            <WalletDropdownDisconnect />
          </WalletDropdown>
        </Wallet>
      </header>

      {/* Scanner */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {!isConnected ? (
          <div className="text-center">
            <p className="text-gray-400 mb-6">
              Connect your wallet to scan for<br />recoverable dust across chains
            </p>
            <Wallet>
              <ConnectWallet className="btn-primary">
                Connect Wallet
              </ConnectWallet>
            </Wallet>
          </div>
        ) : (
          <>
            {/* Scan Ring */}
            <div className="relative w-56 h-56 mb-8">
              <div className="absolute inset-0 rounded-full border border-gray-700" />
              <div
                className={`absolute inset-0 rounded-full border border-blue-500 border-t-transparent ${
                  isScanning ? 'animate-spin' : ''
                }`}
                style={{ animationDuration: '1.5s' }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-center">
                {isScanning ? (
                  <p className="text-xs text-gray-400 uppercase tracking-widest">
                    Scanning...
                  </p>
                ) : scanResult ? (
                  <div>
                    <p className="text-5xl font-light text-white">
                      ${scanResult.totalRecoverable.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 uppercase tracking-widest mt-2">
                      Total recoverable
                    </p>
                  </div>
                ) : (
                  <button onClick={handleScan} className="btn-primary">
                    Scan Wallet
                  </button>
                )}
              </div>
            </div>

            {/* Chain List */}
            {scanResult && scanResult.chains.length > 0 && (
              <div className="w-full grid grid-cols-2 gap-3 mb-6">
                {scanResult.chains.map((chain) => (
                  <div key={chain.chainId} className="card">
                    <p className="text-xs text-gray-500 uppercase">{chain.name}</p>
                    <p className="text-lg text-white">${chain.totalUSD.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-red-500 text-sm mb-4">{error}</p>
            )}
          </>
        )}
      </div>

      {/* Action Area */}
      {isConnected && scanResult && (
        <div className="mt-auto">
          {/* Target Selector */}
          <div className="card flex justify-between items-center mb-4">
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Consolidate to</p>
              <p className="text-white">Base Network</p>
            </div>
            <div className="flex gap-2">
              {(['USDC', 'ETH'] as const).map((asset) => (
                <button
                  key={asset}
                  onClick={() => setTargetAsset(asset)}
                  className={`px-4 py-2 rounded text-sm ${
                    targetAsset === asset
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-600 text-gray-400'
                  }`}
                >
                  {asset}
                </button>
              ))}
            </div>
          </div>

          {/* Consolidate Button */}
          <button
            onClick={handleConsolidate}
            disabled={!estimate?.worthIt || isConsolidating}
            className="btn-primary w-full"
          >
            {isConsolidating
              ? 'Consolidating...'
              : estimate?.worthIt
              ? 'Consolidate'
              : 'Amount too small'}
          </button>

          {/* Fee Estimate */}
          {estimate && (
            <p className="text-center text-xs text-gray-500 mt-3">
              Est. fees: ${estimate.fees.total.toFixed(2)} · Net: ${estimate.netAmount.toFixed(2)}
            </p>
          )}
        </div>
      )}

      {/* Processing Overlay */}
      {isConsolidating && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-16 h-16 border border-gray-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-6" />
            <p className="text-gray-400">
              Consolidating across {scanResult?.chainCount} chains...
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
