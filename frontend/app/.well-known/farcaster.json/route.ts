import { NextResponse } from 'next/server';
import { minikitConfig } from '@/lib/config';

export async function GET() {
  return NextResponse.json(minikitConfig, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
