import { isAddress } from "viem";
import { CGProgramView } from "~~/app/cgprogram/[address]/_components/CGProgramView";

type PageProps = {
  params: Promise<{ address: string }>;
};

const CGProgramPage = async (props: PageProps) => {
  const { address } = await props.params;

  if (!isAddress(address)) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <p className="text-error text-lg">Invalid contract address.</p>
      </div>
    );
  }

  return <CGProgramView address={address} />;
};

export default CGProgramPage;
