import { isAddress } from "viem";
import { WalletView } from "~~/app/wallet/[address]/_components/WalletView";

type PageProps = {
  params: Promise<{ address: string }>;
};

const WalletPage = async (props: PageProps) => {
  const { address } = await props.params;

  if (!isAddress(address)) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <p className="text-error text-lg">Invalid wallet address.</p>
      </div>
    );
  }

  return <WalletView address={address} />;
};

export default WalletPage;
