const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying to BASE MAINNET with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Base Mainnet addresses
  const config = {
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base Mainnet
    weth: "0x4200000000000000000000000000000000000006", // WETH on Base
    swapRouter: "0x0000000000000000000000000000000000000000", // Placeholder - using 0x API
  };

  console.log("\nDeploying DustConsolidatorMVP...");
  const DustConsolidatorMVP = await hre.ethers.getContractFactory("DustConsolidatorMVP");
  const consolidator = await DustConsolidatorMVP.deploy(
    config.usdc,
    config.weth,
    config.swapRouter
  );
  await consolidator.waitForDeployment();
  const consolidatorAddress = await consolidator.getAddress();
  console.log("DustConsolidatorMVP deployed to:", consolidatorAddress);

  // Configure: set deployer as backend
  console.log("\nConfiguring contract...");
  await consolidator.setBackend(deployer.address);
  console.log("Backend set to:", deployer.address);

  // Set fee to 1.2% (120 basis points)
  console.log("\nSetting service fee to 1.2%...");
  await consolidator.setServiceFee(120);
  console.log("Service fee set to 120 bps (1.2%)");

  // Summary
  console.log("\n========================================");
  console.log("MAINNET DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("Network: Base Mainnet");
  console.log("DustConsolidatorMVP:", consolidatorAddress);
  console.log("Owner:", deployer.address);
  console.log("Backend:", deployer.address);
  console.log("Service Fee: 1.2%");
  console.log("========================================");
  console.log("\nView on Basescan:");
  console.log(`https://basescan.org/address/${consolidatorAddress}`);
  console.log("========================================");

  // Save deployment
  const fs = require("fs");
  if (!fs.existsSync("./deployments")) {
    fs.mkdirSync("./deployments");
  }
  fs.writeFileSync(
    "./deployments/base-mainnet.json",
    JSON.stringify({
      network: "baseMainnet",
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts: {
        DustConsolidatorMVP: consolidatorAddress,
      },
      config,
    }, null, 2)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
