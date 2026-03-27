import { isAddress } from "viem";
import { CGTokenView } from "~~/app/token/[address]/_components/CGTokenView";

type PageProps = {
  params: Promise<{ address: string }>;
};

const CGTokenPage = async (props: PageProps) => {
  const { address } = await props.params;

  if (!isAddress(address)) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <p className="text-error text-lg">Invalid contract address.</p>
      </div>
    );
  }

  return <CGTokenView address={address} />;
};

export default CGTokenPage;
