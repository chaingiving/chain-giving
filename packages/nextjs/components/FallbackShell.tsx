"use client";

import { ReactNode, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { menuLinks } from "~~/components/menuLinks";

const fallbackLinks = [
  ...menuLinks,
  {
    label: "About Us",
    href: "https://chain.giving",
    icon: <InformationCircleIcon className="h-4 w-4" />,
  },
];

const FallbackMenuLinks = () => {
  const pathname = usePathname();
  return (
    <>
      {fallbackLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive ? "bg-secondary shadow-md" : ""
              } hover:bg-secondary hover:shadow-md focus:!bg-secondary active:!text-neutral py-1.5 px-3 text-sm rounded-full gap-2 grid grid-flow-col`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Minimal site shell used as the providers-error fallback. Renders without any
 * wagmi/RainbowKit/AppKit dependencies so users can still navigate when the
 * wallet stack fails to initialize.
 */
export const FallbackShell = ({ children }: { children: ReactNode }) => {
  const burgerMenuRef = useRef<HTMLDetailsElement>(null);

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky lg:static top-0 navbar bg-base-100 min-h-0 shrink-0 justify-between z-20 shadow-md shadow-secondary px-0 sm:px-2">
        <div className="navbar-start w-auto lg:w-1/2">
          <details className="dropdown" ref={burgerMenuRef}>
            <summary className="ml-1 btn btn-ghost lg:hidden hover:bg-transparent">
              <Bars3Icon className="h-1/2" />
            </summary>
            <ul
              className="menu menu-compact dropdown-content mt-3 p-2 shadow-sm bg-base-100 rounded-box w-52"
              onClick={() => burgerMenuRef.current?.removeAttribute("open")}
            >
              <FallbackMenuLinks />
            </ul>
          </details>
          <Link href="/" passHref className="hidden lg:flex items-center gap-2 ml-4 mr-6 shrink-0">
            <div className="flex relative w-10 h-10">
              <Image alt="Chain.Giving logo" className="cursor-pointer" fill src="/logo.svg" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold leading-tight">Chain.Giving</span>
              <span className="text-xs">Truthful Giving for Everyone</span>
            </div>
          </Link>
          <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-2">
            <FallbackMenuLinks />
          </ul>
        </div>
      </div>
      <main className="relative flex flex-col flex-1">{children}</main>
    </div>
  );
};
