'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import sdk from '@farcaster/frame-sdk';
import { API_URL } from '@/lib/config';

interface Chain {
  chainId: number;
  name: string;
  totalUSD: number;
  tokens: { symbol: string; usdValue: number }[];
}

interface ScanResult {
  chains: Chain[];
  totalRecoverable: number;
  chainCount: number;
}

interface Estimate {
  netAmount: number;
  fees: { total: number };
  worthIt: boolean;
}

type View = 'home' | 'scanning' | 'result' | 'processing' | 'success';

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const [view, setView] = useState<View>('home');
  const [inputAddress, setInputAddress] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [targetAsset, setTargetAsset] = useState<'USDC' | 'ETH'>('USDC');

  const activeAddress = address || inputAddress;
  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(activeAddress);

  // Signal to MiniKit that the app is ready
  useEffect(() => {
    const init = async () => {
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.log('MiniKit ready call failed (expected outside frame):', e);
      }
    };
    init();
  }, []);

  const scan = async () => {
    if (!isValidAddress) return;
    setView('scanning');

    try {
      const res = await fetch(`${API_URL}/api/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: activeAddress, targetAsset }),
      });
      const data = await res.json();

      if (data.success) {
        setScanResult(data.data.scan);
        setEstimate(data.data.estimate);
        setView('result');
      } else {
        setView('home');
      }
    } catch {
      setView('home');
    }
  };

  const consolidate = async () => {
    if (!isConnected) return;
    setView('processing');

    try {
      await fetch(`${API_URL}/api/consolidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, targetAsset }),
      });
      await new Promise(r => setTimeout(r, 3000));
      setView('success');
    } catch {
      setView('result');
    }
  };

  const reset = () => {
    setView('home');
    setScanResult(null);
    setEstimate(null);
    setInputAddress('');
  };

  // Home View
  if (view === 'home') {
    return (
      <main className="min-h-screen flex flex-col px-6 py-12 max-w-lg mx-auto">
        {/* Header */}
        <header className="flex justify-between items-start mb-auto">
          <h1 className="text-2xl font-light tracking-tight">Dust</h1>
          {isConnected && (
            <button
              onClick={() => disconnect()}
              className="caption text-[var(--text-secondary)] hover:text-white transition-all"
            >
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </button>
          )}
        </header>

        {/* Center Content */}
        <div className="my-auto py-20 animate-fade-in">
          <p className="text-[var(--text-secondary)] body mb-8 max-w-[280px]">
            Got dust in your wallet? Let us sweep it for you into a single asset on Base.
          </p>

          {/* Address Input */}
          <div className="mb-6">
            <input
              type="text"
              value={isConnected ? address : inputAddress}
              onChange={(e) => setInputAddress(e.target.value)}
              placeholder="Paste wallet address"
              disabled={isConnected}
              className="w-full bg-transparent border-b border-[var(--border)] py-4 text-white placeholder:text-[var(--text-tertiary)] focus:border-[var(--text-secondary)] transition-all disabled:opacity-50"
            />
          </div>

          {/* Scan Button */}
          <button
            onClick={scan}
            disabled={!isValidAddress}
            className="w-full py-4 bg-white text-black font-medium rounded-full hover:bg-[var(--text-secondary)] transition-all disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Scan
          </button>

          {/* Connect Options */}
          {!isConnected && (
            <div className="mt-12 pt-8 border-t border-[var(--border)]">
              <p className="caption text-[var(--text-tertiary)] mb-4">Or connect wallet</p>
              <div className="flex gap-3">
                {connectors.map((connector) => (
                  <button
                    key={connector.uid}
                    onClick={() => connect({ connector })}
                    className="flex-1 py-3 border border-[var(--border)] rounded-full text-sm text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:text-white transition-all"
                  >
                    {connector.name === 'Coinbase Wallet' ? 'Coinbase' : connector.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-auto text-center">
          <p className="caption text-[var(--text-tertiary)]">Base Network</p>
        </footer>
      </main>
    );
  }

  // Scanning View
  if (view === 'scanning') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="w-12 h-12 border border-[var(--border)] border-t-white rounded-full animate-spin mx-auto mb-8" />
          <p className="caption text-[var(--text-secondary)]">Scanning chains</p>
        </div>
      </main>
    );
  }

  // Result View
  if (view === 'result' && scanResult && estimate) {
    return (
      <main className="min-h-screen flex flex-col px-6 py-12 max-w-lg mx-auto">
        {/* Header */}
        <header className="flex justify-between items-start">
          <button onClick={reset} className="caption text-[var(--text-secondary)] hover:text-white transition-all">
            ← Back
          </button>
          {isConnected && (
            <span className="caption text-[var(--text-tertiary)]">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
          )}
        </header>

        {/* Amount */}
        <div className="my-auto py-16 text-center stagger">
          <p className="caption text-[var(--text-secondary)] mb-4">Recoverable</p>
          <h2 className="display mb-2">${scanResult.totalRecoverable.toFixed(2)}</h2>
          <p className="body text-[var(--text-tertiary)] mb-6">
            across {scanResult.chainCount} chain{scanResult.chainCount !== 1 ? 's' : ''}
          </p>
          <p className="body text-[var(--text-tertiary)] max-w-[280px] mx-auto opacity-60">
            We swept what we could. A few crumbs were too tiny to rescue — moving them would cost more than they're worth. Some dust is just... dust.
          </p>
        </div>

        {/* Chains */}
        <div className="mb-8 stagger">
          {scanResult.chains.map((chain) => (
            <div
              key={chain.chainId}
              className="flex justify-between py-4 border-b border-[var(--border)]"
            >
              <span className="text-[var(--text-secondary)]">{chain.name}</span>
              <span className="text-white">${chain.totalUSD.toFixed(2)}</span>
            </div>
          ))}
        </div>

        {/* Target Asset Toggle */}
        <div className="flex gap-2 mb-4">
          {(['USDC', 'ETH'] as const).map((asset) => (
            <button
              key={asset}
              onClick={() => setTargetAsset(asset)}
              className={`flex-1 py-3 rounded-full text-sm transition-all ${
                targetAsset === asset
                  ? 'bg-white text-black'
                  : 'border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
              }`}
            >
              {asset}
            </button>
          ))}
        </div>

        {/* Action */}
        {isConnected ? (
          <button
            onClick={consolidate}
            disabled={!estimate.worthIt}
            className="w-full py-4 bg-white text-black font-medium rounded-full hover:bg-[var(--text-secondary)] transition-all disabled:opacity-20"
          >
            {estimate.worthIt ? 'Consolidate' : 'Amount too small'}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="caption text-[var(--text-tertiary)] text-center">Connect to consolidate</p>
            <div className="flex gap-3">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => connect({ connector })}
                  className="flex-1 py-3 border border-[var(--border)] rounded-full text-sm text-[var(--text-secondary)] hover:border-white hover:text-white transition-all"
                >
                  {connector.name === 'Coinbase Wallet' ? 'Coinbase' : connector.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fee Info */}
        <p className="caption text-[var(--text-tertiary)] text-center mt-4">
          Net: ${estimate.netAmount.toFixed(2)} after ${estimate.fees.total.toFixed(2)} fees
        </p>
      </main>
    );
  }

  // Processing View
  if (view === 'processing') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 border border-[var(--border)] border-t-white rounded-full animate-spin mx-auto mb-8" />
          <p className="headline text-white mb-2">Consolidating</p>
          <p className="caption text-[var(--text-secondary)]">{scanResult?.chainCount} chains → Base</p>
        </div>
      </main>
    );
  }

  // Success View
  if (view === 'success') {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full border border-[var(--success)] flex items-center justify-center mx-auto mb-8">
            <svg className="w-8 h-8 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="display mb-2">${estimate?.netAmount.toFixed(2)}</p>
          <p className="body text-[var(--text-secondary)] mb-12">Consolidated to Base</p>
          <button
            onClick={reset}
            className="py-3 px-8 border border-[var(--border)] rounded-full text-sm text-[var(--text-secondary)] hover:border-white hover:text-white transition-all"
          >
            Done
          </button>
        </div>
      </main>
    );
  }

  return null;
}
