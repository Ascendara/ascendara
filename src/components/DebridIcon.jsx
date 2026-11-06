import { Server } from "lucide-react";
import TorboxIcon from "./TorboxIcon";
import RealDebridIcon from "./RealDebridIcon";
import AllDebridIcon from "./AllDebridIcon";

const icons = {
  torbox: TorboxIcon,
  realdebrid: RealDebridIcon,
  alldebrid: AllDebridIcon,
};

export default function DebridIcon({ provider, ...props }) {
  const Icon = icons[provider?.id] || Server;
  return <Icon {...props} />;
}
