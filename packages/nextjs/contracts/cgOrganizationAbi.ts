export const cgOrganizationAbi = [
  // ── Errors ──────────────────────────────────────────────────────────────
  { inputs: [{ name: "owner", type: "address" }], name: "OwnableInvalidOwner", type: "error" },
  { inputs: [{ name: "account", type: "address" }], name: "OwnableUnauthorizedAccount", type: "error" },

  // ── Events ──────────────────────────────────────────────────────────────
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "previousOwner", type: "address" },
      { indexed: true, name: "newOwner", type: "address" },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "program", type: "address" },
      { indexed: false, name: "name", type: "string" },
      { indexed: false, name: "lockDistributions", type: "bool" },
    ],
    name: "ProgramCreated",
    type: "event",
  },

  // ── Write functions ─────────────────────────────────────────────────────
  {
    inputs: [
      { name: "name_", type: "string" },
      { name: "lockDistributions_", type: "bool" },
    ],
    name: "createProgram",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [], name: "renounceOwnership", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [{ name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ── View functions ──────────────────────────────────────────────────────
  {
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    name: "getPrograms",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "isProgram",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "name", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "owner", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  {
    inputs: [],
    name: "programCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "programFactory",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "programs",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
