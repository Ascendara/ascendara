import { Server } from "lucide-react";
import TorboxIcon from "./TorboxIcon";

const icons = { torbox: TorboxIcon };

export default function DebridIcon({ provider, ...props }) {
  const Icon = icons[provider?.id] || Server;
  return <Icon {...props} />;
}
