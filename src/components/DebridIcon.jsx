import { Server } from "lucide-react";
import TorboxIcon from "./TorboxIcon";
import RealDebridIcon from "./RealDebridIcon";

const icons = { torbox: TorboxIcon, realdebrid: RealDebridIcon };

export default function DebridIcon({ provider, ...props }) {
  const Icon = icons[provider?.id] || Server;
  return <Icon {...props} />;
}
