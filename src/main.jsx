import { fixAnimationClock } from "@/lib/animationClock.js";
import { initializeConsole } from "@/lib/consoleIntro.js";
import { loadRemoteIcon } from "@/hooks/useAppIcon";

import ReactDOM from "react-dom/client";
import App from "./app";
import "./app.css";
import "./i18n";

fixAnimationClock();
initializeConsole();
// Start fetching early; the logo itself only changes once boot has finished.
loadRemoteIcon();
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
