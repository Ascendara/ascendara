import { useState, useEffect } from "react";
import gameUpdateService from "@/services/gameUpdateService";
import { toast } from "sonner";
import GamepadFileBrowser from "@/components/GamepadFileBrowser";

// Executable Manager Dialog Component
const ExecutableManagerDialog = ({
  open,
  onClose,
  gameName,
  isCustom,
  t,
  onSave,
  bigPictureMode = false,
}) => {
  const [executables, setExecutables] = useState([]);
  const [exeExists, setExeExists] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [pendingChangeIndex, setPendingChangeIndex] = useState(null);

  const handleAddExecutable = async () => {
    setPendingChangeIndex(null);
    setShowFileBrowser(true);
  };

  const handleChangeExecutable = async index => {
    setPendingChangeIndex(index);
    setShowFileBrowser(true);
  };

  useEffect(() => {
    if (open && gameName) {
      setLoading(true);
      gameUpdateService.getGameExecutables(gameName, isCustom).then(async exes => {
        const exeList = exes.length > 0 ? exes : [""];
        setExecutables(exeList);
        const existsMap = {};
        for (const exe of exeList) {
          if (exe) {
            existsMap[exe] = await window.electron.checkFileExists(exe);
          }
        }
        setExeExists(existsMap);
        setLoading(false);
      });
    }
  }, [open, gameName, isCustom]);

  useEffect(() => {
    const checkExists = async () => {
      const newExistsMap = { ...exeExists };
      let hasChanges = false;
      for (const exe of executables) {
        if (exe && !(exe in newExistsMap)) {
          newExistsMap[exe] = await window.electron.checkFileExists(exe);
          hasChanges = true;
        }
      }
      if (hasChanges) {
        setExeExists(newExistsMap);
      }
    };
    if (!loading && executables.length > 0) {
      checkExists();
    }
  }, [executables, loading]);

  const handleRemoveExecutable = index => {
    if (executables.length <= 1) return;
    setExecutables(prev => prev.filter((_, i) => i !== index));
  };

  const handleMakePrimary = index => {
    if (index === 0) return;
    setExecutables(prev => {
      const updated = [...prev];
      const [item] = updated.splice(index, 1);
      updated.unshift(item);
      return updated;
    });
  };

  const handleSave = async () => {
    const validExecutables = executables.filter(exe => exe && exe.trim() !== "");
    if (validExecutables.length === 0) {
      toast.error(t("library.executableManager.atLeastOne"));
      return;
    }
    setSaving(true);
    const success = await gameUpdateService.updateGameExecutables(
      gameName,
      validExecutables,
      isCustom
    );
    setSaving(false);
    if (success) {
      toast.success(t("library.executableManager.saved"));
      if (onSave) {
        onSave(validExecutables);
      }
      onClose();
    } else {
      toast.error(t("library.executableManager.saveFailed"));
    }
  };

  // Waiting for executables to be loaded
  const resolvedInitialPath =
    !loading && executables[0] ? executables[0].replace(/[\\/][^\\/]+$/, "") : null;

  return (
    <GamepadFileBrowser
      isOpen={open && !loading}
      onClose={onClose}
      onSelect={async exePath => {
        if (!exePath) {
          onClose();
          return;
        }
        let newList;
        if (pendingChangeIndex === null) {
          newList = [...executables.filter(Boolean), exePath];
        } else {
          newList = [...executables];
          newList[pendingChangeIndex] = exePath;
        }
        newList = newList.filter(Boolean);
        setExecutables(newList);
        const exists = await window.electron.checkFileExists(exePath);
        setExeExists(prev => ({ ...prev, [exePath]: exists }));
        setPendingChangeIndex(null);

        // Update executables list
        await gameUpdateService.updateGameExecutables(gameName, newList, isCustom);
        // Update executable json entry
        await window.electron.modifyGameExecutable(gameName, newList[newList.length - 1]);

        if (onSave) onSave(newList);
        onClose();
      }}
      initialPath={resolvedInitialPath}
      title={t("library.executableManager.title") || "Select Executable"}
      filterExe={true}
      controllerType="xbox"
      t={t}
    />
  );
};

export { ExecutableManagerDialog };
