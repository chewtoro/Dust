const ROOT_URL = process.env.NEXT_PUBLIC_URL || 'https://frontend-ten-silk-23.vercel.app';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-one-chi-62.vercel.app';

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0xaAa64c47e45D845FB756eB386561c883F61F8777';

export const minikitConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: ""
  },
  miniapp: {
    version: "1",
    imageUrl: "https://i.postimg.cc/1tGgDbTF/Dust-App-Icon.png",
    name: "Dust",
    subtitle: "Sweep Your Crypto Dust",
    description: "Consolidate scattered tokens across chains into USDC or ETH on Base. No gas needed.",
    screenshotUrls: [`${ROOT_URL}/screenshot.png`],
    iconUrl: "https://i.postimg.cc/1tGgDbTF/Dust-App-Icon.png",
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "finance",
    tags: ["defi", "dust", "consolidation", "swap", "base"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Some dust is just... dust.",
    ogTitle: "Dust - Consolidate Crypto Dust",
    ogDescription: "Sweep scattered tokens across chains into a single asset on Base.",
    ogImageUrl: `${ROOT_URL}/og.png`,
  },
} as const;
