export const ROOT_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3001';
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const minikitConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: ""
  },
  miniapp: {
    version: "1",
    name: "Dust",
    subtitle: "Consolidate Your Crypto Dust",
    description: "Sweep scattered tokens across chains into USDC or ETH on Base. No gas needed.",
    screenshotUrls: [`${ROOT_URL}/screenshot.png`],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#0a0a0a",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "finance",
    tags: ["defi", "dust", "consolidation", "base", "cross-chain"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Sweep your dust to Base",
    ogTitle: "Dust - Consolidate Crypto Dust",
    ogDescription: "Sweep scattered tokens across chains into USDC or ETH on Base",
    ogImageUrl: `${ROOT_URL}/og.png`,
  },
} as const;

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0xaAa64c47e45D845FB756eB386561c883F61F8777';
