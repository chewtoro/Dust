import { NextRequest, NextResponse } from 'next/server';

// Webhook endpoint for Base mini app events
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Handle mini app events
    console.log('Webhook received:', body);
    
    // You can handle different event types here
    // e.g., user installs, transactions, etc.
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
