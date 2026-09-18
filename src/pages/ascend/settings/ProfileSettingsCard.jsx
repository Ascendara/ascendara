import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  User,
  Loader2,
  Pencil,
  Camera,
  Save,
  Gamepad2,
  Globe,
  Github,
  Link2,
  Sparkle,
  Crown,
  BadgeCheck,
  Hammer,
  Megaphone,
} from "lucide-react";

export default function ProfileSettingsCard({
  t,
  isEditingProfile,
  handleStartEditProfile,
  editPhotoURL,
  editDisplayName,
  user,
  setEditPhotoURL,
  setEditDisplayName,
  editBio,
  setEditBio,
  editCountry,
  setEditCountry,
  editDiscord,
  editEpicId,
  setEditEpicId,
  editGithub,
  setEditGithub,
  editSteam,
  setEditSteam,
  handleSaveProfile,
  isSavingProfile,
  handleCancelEditProfile,
  userData,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
      <div className="flex items-center justify-between border-b border-border/50 p-5">
        <div className="flex items-center gap-2">
          <User className="mb-3 h-5 w-5 text-primary" />
          <h2 className="font-semibold">{t("ascend.settings.profile")}</h2>
        </div>
        {!isEditingProfile && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleStartEditProfile}
            className="gap-2"
          >
            <Pencil className="h-4 w-4" />
            {t("ascend.settings.edit")}
          </Button>
        )}
      </div>

      {isEditingProfile ? (
        <div className="space-y-6 p-5">
          {/* Avatar & Photo URL */}
          <div className="flex items-start gap-5">
            <div className="relative shrink-0">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                {editPhotoURL ? (
                  <img
                    src={editPhotoURL}
                    alt="Preview"
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-primary-foreground text-3xl font-bold">
                    {(editDisplayName || user.email || "U")[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 rounded-full bg-primary p-2 shadow-lg">
                <Camera className="text-primary-foreground h-4 w-4" />
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="photoURL" className="text-sm font-medium">
                {t("ascend.settings.photoURL")}
              </Label>
              <Input
                id="photoURL"
                type="url"
                placeholder={t("ascend.settings.photoURLPlaceholder")}
                value={editPhotoURL}
                onChange={e => setEditPhotoURL(e.target.value)}
                className="h-11 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                {t("ascend.settings.photoURLHint")}
              </p>
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="editDisplayName" className="text-sm font-medium">
              {t("ascend.settings.displayName")}
            </Label>
            <Input
              id="editDisplayName"
              type="text"
              placeholder={t("account.form.displayNamePlaceholder")}
              value={editDisplayName}
              onChange={e => setEditDisplayName(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="editBio" className="text-sm font-medium">
                {t("ascend.settings.bio")}
              </Label>
              <span
                className={`text-xs ${editBio.length > 100 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {editBio.length}/100
              </span>
            </div>
            <textarea
              id="editBio"
              placeholder={t("ascend.settings.bioPlaceholder")}
              value={editBio}
              onChange={e => setEditBio(e.target.value.slice(0, 100))}
              className="h-20 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              maxLength={100}
            />
          </div>

          {/* Country */}
          <div className="space-y-2">
            <Label
              htmlFor="editCountry"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <Globe className="h-4 w-4 text-blue-500" />
              {t("ascend.settings.country")}
            </Label>
            <Input
              id="editCountry"
              type="text"
              placeholder={t("ascend.settings.countryPlaceholder")}
              value={editCountry}
              onChange={e => setEditCountry(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Social Links */}
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4 text-primary" />
              {t("ascend.settings.socialLinks")}
            </h3>

            <div className="grid gap-4">
              {/* Discord (Read-only) */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5865F2]/10">
                  <svg
                    className="h-5 w-5 text-[#5865F2]"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <Input
                    type="text"
                    placeholder={t("ascend.settings.discordPlaceholder")}
                    value={editDiscord}
                    readOnly
                    disabled
                    className="h-11 cursor-not-allowed rounded-xl bg-muted/50"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("ascend.settings.discordReadOnly") ||
                      "Discord username is read-only"}
                  </p>
                </div>
              </div>

              {/* Epic Games ID */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/10">
                  <Gamepad2 className="h-5 w-5" />
                </div>
                <Input
                  type="text"
                  placeholder={
                    t("ascend.settings.epicIdPlaceholder") || "Your Epic Games ID"
                  }
                  value={editEpicId}
                  onChange={e => setEditEpicId(e.target.value)}
                  className="h-11 flex-1 rounded-xl"
                />
              </div>

              {/* GitHub */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/10">
                  <Github className="h-5 w-5" />
                </div>
                <Input
                  type="text"
                  placeholder={t("ascend.settings.githubPlaceholder")}
                  value={editGithub}
                  onChange={e => setEditGithub(e.target.value)}
                  className="h-11 flex-1 rounded-xl"
                />
              </div>

              {/* Steam */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/10">
                  <svg
                    className="h-5 w-5 text-[#1b2838] dark:text-white"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
                  </svg>
                </div>
                <Input
                  type="text"
                  placeholder={t("ascend.settings.steamPlaceholder")}
                  value={editSteam}
                  onChange={e => setEditSteam(e.target.value)}
                  className="h-11 flex-1 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 border-t border-border/50 pt-4">
            <Button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="h-11 flex-1 text-secondary"
            >
              {isSavingProfile ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t("ascend.settings.save")}
            </Button>
            <Button
              variant="outline"
              onClick={handleCancelEditProfile}
              disabled={isSavingProfile}
              className="h-11"
            >
              {t("ascend.settings.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-5">
          {/* Profile Display */}
          <div className="flex items-start gap-5">
            <div className="relative shrink-0">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-primary-foreground text-3xl font-bold">
                    {(user.displayName || user.email || "U")[0].toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="flex items-center gap-1 truncate text-xl font-semibold">
                {user.displayName}
                {userData?.owner && (
                  <Crown className="mt-1 h-4 w-4 shrink-0 text-yellow-500" />
                )}
                {userData?.contributor && (
                  <Hammer className="mt-1 h-4 w-4 shrink-0 text-orange-500" />
                )}
                {userData?.verified && (
                  <BadgeCheck className="mt-1 h-4 w-4 shrink-0 text-blue-500" />
                )}
                {userData?.adUser && (
                  <Megaphone className="mt-1 h-4 w-4 shrink-0 text-purple-500" />
                )}
              </h3>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>

              {/* Bio */}
              {userData?.bio && (
                <p className="mt-3 line-clamp-2 text-sm text-foreground/80">
                  {userData.bio}
                </p>
              )}

              {/* Country */}
              {userData?.country && (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4 text-blue-500" />
                  <span>{userData.country}</span>
                </div>
              )}
            </div>
          </div>

          {/* Social Links Display */}
          {(userData?.socials?.linkedDiscord ||
            userData?.socials?.epicId ||
            userData?.socials?.github ||
            userData?.socials?.steam) && (
            <div className="mt-5 border-t border-border/50 pt-5">
              <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                {t("ascend.settings.socialLinks")}
              </h4>
              <div className="flex flex-wrap gap-3">
                {userData?.socials?.linkedDiscord && (
                  <div className="flex items-center gap-2 rounded-xl bg-[#5865F2]/10 px-3 py-2 text-sm">
                    <svg
                      className="h-4 w-4 text-[#5865F2]"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                    <span>{userData.socials.linkedDiscord}</span>
                  </div>
                )}
                {userData?.socials?.epicId && (
                  <div className="flex items-center gap-2 rounded-xl bg-foreground/10 px-3 py-2 text-sm">
                    <Gamepad2 className="h-4 w-4" />
                    <span>{userData.socials.epicId}</span>
                  </div>
                )}
                {userData?.socials?.github && (
                  <div className="flex items-center gap-2 rounded-xl bg-foreground/10 px-3 py-2 text-sm">
                    <Github className="h-4 w-4" />
                    <span>{userData.socials.github}</span>
                  </div>
                )}
                {userData?.socials?.steam && (
                  <div className="flex items-center gap-2 rounded-xl bg-foreground/10 px-3 py-2 text-sm">
                    <svg
                      className="h-4 w-4 dark:text-white"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
                    </svg>
                    <span>{userData.socials.steam}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty state for bio/socials */}
          {!userData?.bio &&
            !userData?.country &&
            !userData?.socials?.linkedDiscord &&
            !userData?.socials?.github &&
            !userData?.socials?.steam && (
              <div className="mt-5 border-t border-border/50 pt-5 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("ascend.settings.noProfileInfo")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartEditProfile}
                  className="mt-3 gap-2"
                >
                  <Sparkle className="h-4 w-4" />
                  {t("ascend.settings.addProfileInfo")}
                </Button>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
