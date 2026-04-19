import * as dotenv from "dotenv";
dotenv.config();
import password from "@inquirer/password";
import { JsonRpcProvider, Wallet } from "ethers";

/**
 * Cancels stuck pending transactions by sending 0-value self-transfers at each stuck nonce
 * with a heavily bumped EIP-1559 fee (20x current estimate). Loops until no stuck txs remain.
 *
 * On L2s like baseSepolia, the RPC only surfaces ONE pending nonce at a time (the next one
 * after the confirmed count). After we cancel and confirm nonce N, nonce N+1 may then become
 * visible as pending if it's also stuck. Hence the loop.
 *
 * Usage:  yarn cancel-stuck-tx
 * Override RPC with CANCEL_RPC_URL env var if needed.
 */
const MAX_ITERATIONS = 1;

async function main() {
  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
  if (!encryptedKey) {
    console.log("🚫️ No encrypted deployer key. Run `yarn generate` or `yarn account:import` first");
    process.exit(1);
  }

  const pass = await password({ message: "Enter password to decrypt private key:" });
  let wallet: Wallet;
  try {
    wallet = (await Wallet.fromEncryptedJson(encryptedKey, pass)) as Wallet;
  } catch {
    console.error("Failed to decrypt private key. Wrong password?");
    process.exit(1);
  }

  const rpcUrl = process.env.CANCEL_RPC_URL ?? "https://sepolia.base.org";
  const provider = new JsonRpcProvider(rpcUrl);
  const signer = wallet.connect(provider);
  const address = await signer.getAddress();

  console.log(`Deployer: ${address}`);
  console.log(`RPC:      ${rpcUrl}`);

  let cancelled = 0;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const [confirmedNonce, pendingNonce] = await Promise.all([
      provider.getTransactionCount(address, "latest"),
      provider.getTransactionCount(address, "pending"),
    ]);

    console.log(`\n[iter ${iter}] confirmed=${confirmedNonce} pending=${pendingNonce}`);

    if (pendingNonce <= confirmedNonce) {
      console.log(cancelled > 0 ? `✅ Cleared ${cancelled} stuck tx(s).` : "✅ No stuck transaction detected.");
      return;
    }

    const stuckNonce = confirmedNonce;
    const fee = await provider.getFeeData();
    const bump = 20n;
    const maxFeePerGas = fee.maxFeePerGas ? fee.maxFeePerGas * bump : undefined;
    const maxPriorityFeePerGas = fee.maxPriorityFeePerGas ? fee.maxPriorityFeePerGas * bump : undefined;

    console.log(`Cancelling nonce ${stuckNonce} (maxFeePerGas=${maxFeePerGas})...`);

    try {
      const tx = await signer.sendTransaction({
        to: address,
        value: 0n,
        nonce: stuckNonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      console.log(`  tx: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  ✔ confirmed in block ${receipt?.blockNumber}`);
      cancelled++;
    } catch (err: any) {
      console.error(`  ✘ Failed to cancel nonce ${stuckNonce}: ${err.shortMessage ?? err.message ?? err}`);
      process.exit(1);
    }
  }

  console.error(`⚠️  Reached MAX_ITERATIONS=${MAX_ITERATIONS} without clearing all pending txs.`);
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
