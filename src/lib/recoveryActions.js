import { toast } from "sonner";
import {
  listOfficialRollbackVersions,
  rollbackAscendaraVersion,
} from "@/services/recoveryService";

export async function startPreviousVersionRollback(t, requestedVersion = null) {
  const toastId = requestedVersion
    ? null
    : toast.loading(t("featureCenters.system.toasts.rollbackChecking"));

  try {
    let version = requestedVersion;
    if (!version) {
      const releases = await listOfficialRollbackVersions();
      if (toastId) toast.dismiss(toastId);
      if (!Array.isArray(releases) || releases.length === 0) {
        toast.info(t("featureCenters.system.toasts.rollbackNone"), {
          description: t("featureCenters.system.toasts.rollbackNoneDescription"),
        });
        return false;
      }
      version = releases[0].version;
    }

    const confirmed = window.confirm(
      t("featureCenters.system.recovery.rollbackConfirm", { version })
    );
    if (!confirmed) return false;

    toast.loading(
      t("featureCenters.system.toasts.rollbackDownloading", { version }),
      { id: "ascendara-rollback" }
    );
    await rollbackAscendaraVersion(version);
    return true;
  } catch (error) {
    if (toastId) toast.dismiss(toastId);
    toast.error(t("featureCenters.system.toasts.rollbackFailed"), {
      id: "ascendara-rollback",
      description: error.message,
    });
    return false;
  }
}
