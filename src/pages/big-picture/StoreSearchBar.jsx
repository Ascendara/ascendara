import { Search } from "lucide-react";

// Store search bar
const StoreSearchBar = ({ isSelected, searchQuery, onClick, t, buttons }) => {
  return (
    <div
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-4 rounded-xl px-6 py-4 transition-all duration-150 ${isSelected ? "scale-[1.02] bg-primary text-secondary" : "bg-muted/80 text-slate-400 hover:bg-muted"}`}
    >
      <Search className="h-6 w-6" />
      <span className="text-lg font-medium">
        {searchQuery || t("bigPicture.searchGame")}
      </span>
      {searchQuery && (
        <span className="ml-auto text-sm opacity-70">
          Press {buttons.confirm} to modify
        </span>
      )}
    </div>
  );
};

export { StoreSearchBar };
