import React from "react";
import { useAtom } from "jotai";
import { useTelepoterAtom } from "@/store/teleport";
import Teleporter from "@/components/lux/teleport/swap/Form";
import SwapFireblock from "@/components/lux/fireblocks/swap/Form";

const Swapper: React.FC = () => {
  const [useTeleporter] = useAtom(useTelepoterAtom);

  if (useTeleporter) {
    return <Teleporter />;
  } else {
    return <SwapFireblock />;
  }
};

export default Swapper;
