import type { SessionOptions } from "iron-session";

export type SiweSessionData = {
  nonce?: string;
  address?: `0x${string}`;
  chainId?: number;
  isLoggedIn: boolean;
  signedInAt?: string;
};

export const defaultSession: SiweSessionData = { isLoggedIn: false };

export function getSessionOptions(): SessionOptions {
  const secret = process.env.IRON_SESSION_SECRET;
  const password =
    secret && secret.length >= 32
      ? secret
      : process.env.NODE_ENV === "production"
        ? (() => {
            throw new Error("IRON_SESSION_SECRET must be set in production (32+ chars)");
          })()
        : "complex_password_at_least_32_characters_long_for_dev";

  return {
    password,
    cookieName: "siwe-session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60,
    },
  };
}
