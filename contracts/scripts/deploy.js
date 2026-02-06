const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Network-specific addresses
  const networkConfig = {
    baseSepolia: {
      ccipRouter: "0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93",
      linkToken: "0xE4aB69C077896252FAFBD49EFD26B5D171A32410",
      usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
      weth: "0x4200000000000000000000000000000000000006", // WETH on Base Sepolia
      swapRouter: "0x0000000000000000000000000000000000000000", // Placeholder
      entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // ERC-4337 EntryPoint
    },
    baseMainnet: {
      ccipRouter: "0x881e3A65B4d4a04dD529061dd0071cf975F58bCD",
      linkToken: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196",
      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      weth: "0x4200000000000000000000000000000000000006",
      swapRouter: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", // 0x Exchange Proxy
      entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    },
  };

  const network = hre.network.name;
  const config = networkConfig[network];

  if (!config) {
    throw new Error(`No config for network: ${network}`);
  }

  console.log(`\nDeploying to ${network}...`);
  console.log("Config:", config);

  // 1. Deploy DustConsolidator
  console.log("\n1. Deploying DustConsolidator...");
  const DustConsolidator = await hre.ethers.getContractFactory("DustConsolidator");
  const dustConsolidator = await DustConsolidator.deploy(
    config.ccipRouter,
    config.usdc,
    config.weth,
    config.swapRouter
  );
  await dustConsolidator.waitForDeployment();
  const consolidatorAddress = await dustConsolidator.getAddress();
  console.log("DustConsolidator deployed to:", consolidatorAddress);

  // 2. Deploy GasPaymaster
  console.log("\n2. Deploying GasPaymaster...");
  const GasPaymaster = await hre.ethers.getContractFactory("GasPaymaster");
  const gasPaymaster = await GasPaymaster.deploy(
    consolidatorAddress,
    config.entryPoint
  );
  await gasPaymaster.waitForDeployment();
  const paymasterAddress = await gasPaymaster.getAddress();
  console.log("GasPaymaster deployed to:", paymasterAddress);

  // 3. Configure contracts
  console.log("\n3. Configuring contracts...");
  
  // Set paymaster in consolidator
  await dustConsolidator.setPaymaster(paymasterAddress);
  console.log("Set paymaster in DustConsolidator");

  // Set backend address (deployer for now)
  await dustConsolidator.setBackend(deployer.address);
  console.log("Set backend to deployer address");

  // Authorize deployer as sponsor in paymaster
  await gasPaymaster.setAuthorizedSponsor(deployer.address, true);
  console.log("Authorized deployer as gas sponsor");

  // 4. Summary
  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("Network:", network);
  console.log("DustConsolidator:", consolidatorAddress);
  console.log("GasPaymaster:", paymasterAddress);
  console.log("========================================");
  console.log("\nNext steps:");
  console.log("1. Fund GasPaymaster with ETH for gas sponsoring");
  console.log("2. Add supported source chains to DustConsolidator");
  console.log("3. Deploy DustSender on source chains");
  console.log("4. Update backend .env with contract addresses");
  console.log("========================================");

  // Save deployment info
  const fs = require("fs");
  const deploymentInfo = {
    network,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      DustConsolidator: consolidatorAddress,
      GasPaymaster: paymasterAddress,
    },
    config,
  };

  fs.writeFileSync(
    `./deployments/${network}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`\nDeployment info saved to ./deployments/${network}.json`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
