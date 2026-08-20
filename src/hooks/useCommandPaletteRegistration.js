import { useEffect } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/context/LanguageContext";
import { useSearch } from "@/context/SearchContext";
import { FEATURE_CENTER_EVENTS, openFeatureCenter } from "@/lib/featureCenterEvents";
import { startPreviousVersionRollback } from "@/lib/recoveryActions";
import { createSettingsRecoveryPoint } from "@/services/recoveryService";

const keywords = {
  system: [
    "system",
    "health",
    "diagnostics",
    "storage",
    "recovery",
    "sistema",
    "saúde",
    "diagnóstico",
    "armazenamento",
    "recuperação",
  ],
  health: [
    "health",
    "diagnostics",
    "dependencies",
    "services",
    "saúde",
    "diagnóstico",
    "dependências",
    "serviços",
  ],
  storage: [
    "storage",
    "disk",
    "space",
    "folders",
    "armazenamento",
    "disco",
    "espaço",
    "pastas",
  ],
  recovery: [
    "recovery",
    "safe mode",
    "rollback",
    "cache",
    "recuperação",
    "modo seguro",
  ],
  profiles: [
    "profiles",
    "launch commands",
    "backup",
    "umu",
    "save paths",
    "perfis",
    "comandos",
    "saves",
  ],
  collections: [
    "collections",
    "library",
    "never played",
    "continue playing",
    "coleções",
    "biblioteca",
    "nunca jogados",
  ],
};

export function useCommandPaletteRegistration() {
  const { registerSearchable, unregisterSearchable } = useSearch();
  const { t } = useLanguage();

  useEffect(() => {
    const commands = [
      {
        id: "system-center",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.systemCenter.label"),
        description: t("featureCenters.commandPalette.commands.systemCenter.description"),
        keywords: keywords.system,
        featured: true,
        onSelect: () =>
          openFeatureCenter(FEATURE_CENTER_EVENTS.system, { tab: "health" }),
      },
      {
        id: "health-center",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.health.label"),
        description: t("featureCenters.commandPalette.commands.health.description"),
        badge: t("featureCenters.system.tabs.health"),
        keywords: keywords.health,
        featured: true,
        onSelect: () =>
          openFeatureCenter(FEATURE_CENTER_EVENTS.system, { tab: "health" }),
      },
      {
        id: "storage-manager",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.storage.label"),
        description: t("featureCenters.commandPalette.commands.storage.description"),
        badge: t("featureCenters.system.tabs.storage"),
        keywords: keywords.storage,
        featured: true,
        onSelect: () =>
          openFeatureCenter(FEATURE_CENTER_EVENTS.system, { tab: "storage" }),
      },
      {
        id: "recovery-center",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.recovery.label"),
        description: t("featureCenters.commandPalette.commands.recovery.description"),
        badge: t("featureCenters.system.tabs.recovery"),
        keywords: keywords.recovery,
        featured: true,
        onSelect: () =>
          openFeatureCenter(FEATURE_CENTER_EVENTS.system, { tab: "recovery" }),
      },
      {
        id: "create-recovery-point",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.createRecovery.label"),
        description: t("featureCenters.commandPalette.commands.createRecovery.description"),
        keywords: [
          "snapshot",
          "settings",
          "backup",
          "configurações",
          "ponto de recuperação",
        ],
        onSelect: () => {
          createSettingsRecoveryPoint("manual")
            .then(() => toast.success(t("featureCenters.system.toasts.pointCreated")))
            .catch(error =>
              toast.error(t("featureCenters.system.toasts.pointCreateFailed"), {
                description: error.message,
              })
            );
        },
      },
      {
        id: "open-recovery-points",
        type: "commands",
        label: t("featureCenters.system.recovery.recoveryPoints"),
        description: t("featureCenters.system.recovery.recoveryPointsDescription"),
        keywords: [
          "restore",
          "settings",
          "snapshot",
          "recovery points",
          "restaurar",
          "configurações",
          "pontos de recuperação",
        ],
        onSelect: () =>
          openFeatureCenter(FEATURE_CENTER_EVENTS.system, { tab: "recovery" }),
      },
      {
        id: "rollback-previous-version",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.rollback.label"),
        description: t("featureCenters.commandPalette.commands.rollback.description"),
        keywords: ["rollback", "downgrade", "previous version", "versão anterior"],
        onSelect: () => startPreviousVersionRollback(t),
      },
      {
        id: "game-profiles",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.profiles.label"),
        description: t("featureCenters.commandPalette.commands.profiles.description"),
        badge: t("featureCenters.profiles.title"),
        keywords: keywords.profiles,
        featured: true,
        onSelect: () => openFeatureCenter(FEATURE_CENTER_EVENTS.profiles),
      },
      {
        id: "smart-collections",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.collections.label"),
        description: t("featureCenters.commandPalette.commands.collections.description"),
        badge: t("featureCenters.collections.title"),
        keywords: keywords.collections,
        featured: true,
        onSelect: () => openFeatureCenter(FEATURE_CENTER_EVENTS.collections),
      },
      {
        id: "big-picture",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.bigPicture.label"),
        description: t("featureCenters.commandPalette.commands.bigPicture.description"),
        keywords: ["controller", "tv", "gamepad", "controle"],
        onSelect: navigate => navigate("/bigpicture"),
      },
      {
        id: "local-refresh",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.localRefresh.label"),
        description: t("featureCenters.commandPalette.commands.localRefresh.description"),
        keywords: ["index", "refresh", "local", "índice", "atualizar"],
        onSelect: navigate => navigate("/localrefresh"),
      },
      {
        id: "open-settings",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.settings.label"),
        description: t("featureCenters.commandPalette.commands.settings.description"),
        keywords: ["settings", "preferences", "configurações", "preferências"],
        onSelect: navigate => navigate("/settings"),
      },
      {
        id: "reload-interface",
        type: "commands",
        label: t("featureCenters.commandPalette.commands.reload.label"),
        description: t("featureCenters.commandPalette.commands.reload.description"),
        keywords: ["reload", "refresh ui", "recarregar", "interface"],
        onSelect: () => window.location.reload(),
      },
    ];

    registerSearchable("commands", commands);
    return () => unregisterSearchable("commands");
  }, [registerSearchable, t, unregisterSearchable]);
}
