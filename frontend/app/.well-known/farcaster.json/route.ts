import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.redirect(
    'https://api.farcaster.xyz/miniapps/hosted-manifest/019c3201-488d-edae-6771-005f78c24a9d',
    307
  );
}
