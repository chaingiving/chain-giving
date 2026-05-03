import React from "react";
import { BugAntIcon, BuildingOfficeIcon, GiftIcon } from "@heroicons/react/24/outline";

export type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "Organizations",
    href: "/organizations",
    icon: <BuildingOfficeIcon className="h-4 w-4" />,
  },
  {
    label: "Programs",
    href: "/programs",
    icon: <GiftIcon className="h-4 w-4" />,
  },
  {
    label: "Debug",
    href: "/debug",
    icon: <BugAntIcon className="h-4 w-4" />,
  },
];
