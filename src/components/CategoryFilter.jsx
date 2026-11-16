import { useMemo, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isMatureCategory } from "@/lib/matureContent";

function CategoryFilter({
  selectedCategories = [],
  setSelectedCategories,
  games = [],
  showMatureCategories,
}) {
  const categories = useMemo(() => {
    const allCategories = new Set();
    games.forEach(game => {
      game.category?.forEach(category => {
        if (showMatureCategories || !isMatureCategory(category)) {
          allCategories.add(category);
        }
      });
    });
    return Array.from(allCategories).sort();
  }, [games, showMatureCategories]);

  useEffect(() => {
    if (!showMatureCategories) {
      setSelectedCategories(prev => {
        const kept = prev.filter(cat => !isMatureCategory(cat));
        return kept.length === prev.length ? prev : kept;
      });
    }
  }, [showMatureCategories, setSelectedCategories]);

  const toggleCategory = category => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(cat => cat !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  return (
    <ScrollArea className="w-full max-w-[600px]">
      <div className="flex flex-wrap gap-2 pb-2">
        {categories.map(category => (
          <Badge
            key={category}
            variant={selectedCategories.includes(category) ? "default" : "outline"}
            className="cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => toggleCategory(category)}
          >
            {category}
          </Badge>
        ))}
      </div>
    </ScrollArea>
  );
}

export default CategoryFilter;
