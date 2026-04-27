import type { DonationCurrency } from "~~/contracts/donationCurrencies";

export const CurrencyLogo = ({
  currency,
  size = 16,
  className,
}: {
  currency: DonationCurrency | undefined;
  size?: number;
  className?: string;
}) => {
  if (!currency) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currency.logo}
      alt={currency.symbol}
      width={size}
      height={size}
      className={`inline-block align-middle ${className ?? ""}`}
    />
  );
};
