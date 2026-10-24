import { initializeConsole } from "@/lib/consoleIntro.js";
import { loadRemoteIcon } from "@/hooks/useAppIcon";

import ReactDOM from "react-dom/client";
import App from "./app";
import "./app.css";
import "./i18n";

initializeConsole();
loadRemoteIcon().then(url => {
  const loaderIcon = document.querySelector("#initial-loader img");
  if (url && loaderIcon) loaderIcon.src = url;
});
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
