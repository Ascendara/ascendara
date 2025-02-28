import React from "react";
import { Calendar, Users, Tag, Award, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Game Metadata Component
 * Displays metadata information about a game
 */
const GameMetadata = ({ gameInfo, className }) => {
  if (!gameInfo) return null;

  // Extract relevant information
  const { release_dates, genres, platforms, involved_companies, rating } = gameInfo;

  // Format the rating to a score out of 100
  const formattedRating = rating ? Math.round(rating) : null;

  // Get developers and publishers
  const developers =
    involved_companies
      ?.filter(company => company.developer)
      .map(company => company.company?.name)
      .filter(Boolean) || [];

  const publishers =
    involved_companies
      ?.filter(company => company.publisher)
      .map(company => company.company?.name)
      .filter(Boolean) || [];

  // Get release date
  const releaseDate = release_dates?.length > 0 ? release_dates[0].human : null;

  // Get genres
  const gameGenres = genres?.map(genre => genre.name).filter(Boolean) || [];

  // Get platforms
  const gamePlatforms = platforms?.map(platform => platform.name).filter(Boolean) || [];

  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-lg font-semibold">Game Details</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Release Date */}
        {releaseDate && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-sm text-muted-foreground">Release Date</span>
              <p className="text-sm font-medium">{releaseDate}</p>
            </div>
          </div>
        )}

        {/* Developers */}
        {developers.length > 0 && (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-sm text-muted-foreground">Developer</span>
              <p className="text-sm font-medium">{developers.join(", ")}</p>
            </div>
          </div>
        )}

        {/* Publishers */}
        {publishers.length > 0 && (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-sm text-muted-foreground">Publisher</span>
              <p className="text-sm font-medium">{publishers.join(", ")}</p>
            </div>
          </div>
        )}

        {/* Rating */}
        {formattedRating && (
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-sm text-muted-foreground">Rating</span>
              <p className="text-sm font-medium">{formattedRating}/100</p>
            </div>
          </div>
        )}
      </div>

      {/* Genres */}
      {gameGenres.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Genres</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {gameGenres.map((genre, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {genre}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Platforms */}
      {gamePlatforms.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Platforms</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {gamePlatforms.map((platform, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {platform}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GameMetadata;
