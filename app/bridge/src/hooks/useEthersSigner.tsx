import React from "react";
import { Web3Context } from "@/context/ethersContext";

export const useEthersSigner = () => {
  const context = React.useContext(Web3Context);
  if (!context) {
    throw new Error("");
  } else {
    return context;
  }
};
