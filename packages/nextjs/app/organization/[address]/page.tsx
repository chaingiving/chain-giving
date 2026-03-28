import { isAddress } from "viem";
import { CGOrganizationView } from "~~/app/organization/[address]/_components/CGOrganizationView";

type PageProps = {
  params: Promise<{ address: string }>;
};

const CGOrganizationPage = async (props: PageProps) => {
  const { address } = await props.params;

  if (!isAddress(address)) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <p className="text-error text-lg">Invalid contract address.</p>
      </div>
    );
  }

  return <CGOrganizationView address={address} />;
};

export default CGOrganizationPage;
