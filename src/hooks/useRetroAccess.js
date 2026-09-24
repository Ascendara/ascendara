import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getRetroCloudAccess } from "@/services/retroService";

export default function useRetroAccess() {
  const { user, userData } = useAuth();
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const uid = user?.uid;
  const active = userData?.ascendSubscription?.active;
  const verified = userData?.verified;
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    (async () => {
      try {
        const allowed = uid ? await getRetroCloudAccess() : false;
        if (!cancelled) setResult({ uid, active, verified, allowed });
      } catch (error) {
        if (!cancelled)
          setResult({ uid, active, verified, allowed: false, error: error.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, active, verified, revision]);
  const current =
    result?.uid === uid && result?.active === active && result?.verified === verified
      ? result
      : null;
  return {
    allowed: current?.allowed === true,
    loading: !current,
    error: current?.error,
    signedIn: !!uid,
    retry: () => setRevision(value => value + 1),
  };
}
