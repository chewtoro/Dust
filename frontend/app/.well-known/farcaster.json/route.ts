import { NextResponse } from 'next/server';
import { minikitConfig } from '@/lib/config';

// Farcaster manifest for Base mini app discovery
export async function GET() {
  return NextResponse.json(minikitConfig);
}
