const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying MVP contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Base Sepolia addresses
  const config = {
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    weth: "0x4200000000000000000000000000000000000006",
    swapRouter: "0x0000000000000000000000000000000000000000", // Placeholder for MVP
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

  // Summary
  console.log("\n========================================");
  console.log("MVP DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("Network: Base Sepolia");
  console.log("DustConsolidatorMVP:", consolidatorAddress);
  console.log("Owner:", deployer.address);
  console.log("Backend:", deployer.address);
  console.log("========================================");
  console.log("\nView on Basescan:");
  console.log(`https://sepolia.basescan.org/address/${consolidatorAddress}`);
  console.log("========================================");

  // Save deployment
  const fs = require("fs");
  if (!fs.existsSync("./deployments")) {
    fs.mkdirSync("./deployments");
  }
  fs.writeFileSync(
    "./deployments/base-sepolia-mvp.json",
    JSON.stringify({
      network: "baseSepolia",
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
