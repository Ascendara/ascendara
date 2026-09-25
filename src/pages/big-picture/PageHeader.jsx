import { createContext, useContext } from "react";
import {
  Home,
  Library,
  Compass,
  Download,
  Gamepad2,
  UserRound,
  Settings,
  Search,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export const PageNavigationContext = createContext(null);
export const pageLinks = [
  ["carousel", "Home", Home],
  ["library", "Library", Library],
  ["store", "Browse", Compass],
  ["downloads", "Downloads", Download],
  ["retro", "Retro", Gamepad2],
];
export const pageFocusIds = [
  ...pageLinks.map(([id]) => `page-${id}`),
  "page-search",
  "page-profile",
  "page-preferences",
];

export function PageNavigation({ focus, fallback }) {
  const context = useContext(PageNavigationContext);
  const navigation = context || fallback;
  const { user, userData } = useAuth();
  if (!navigation) return null;
  return (
    <nav className="bp-navigation" aria-label="Big Picture pages">
      <div className="bp-navigation-tabs">
        {pageLinks.map(([id, label, Icon]) => (
          <button
            type="button"
            key={id}
            {...focus(`page-${id}`)}
            className="bp-action"
            aria-current={navigation.view === id ? "page" : undefined}
            onClick={() => navigation.changeView(id)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
            {id === "downloads" && navigation.downloadCount > 0 && (
              <span className="bp-count">{navigation.downloadCount}</span>
            )}
          </button>
        ))}
      </div>
      <div className="bp-navigation-tools">
        <button
          type="button"
          {...focus("page-search")}
          className="bp-action"
          aria-label="Search games"
          onClick={navigation.search}
        >
          <Search />
        </button>
        <button
          type="button"
          {...focus("page-profile")}
          className="bp-action"
          aria-label="Profile"
          aria-current={navigation.view === "profile" ? "page" : undefined}
          onClick={() => navigation.changeView("profile")}
        >
          <UserRound />
          <span>{userData?.username || user?.displayName || "Profile"}</span>
        </button>
        <button
          type="button"
          {...focus("page-preferences")}
          className="bp-action"
          aria-label="Settings"
          aria-current={navigation.view === "preferences" ? "page" : undefined}
          onClick={() => navigation.changeView("preferences")}
        >
          <Settings />
        </button>
      </div>
    </nav>
  );
}

export function PageHeader({ title, description }) {
  return (
    <header className="bp-page-heading">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
