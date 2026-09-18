import { initializeConsole } from "@/lib/consoleIntro.js";

import ReactDOM from "react-dom/client";
import App from "./app";
import "./app.css";
import "./i18n";

initializeConsole();
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
