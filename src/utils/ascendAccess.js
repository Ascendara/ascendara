// Live account entitlements take precedence over an earlier trial check.
export function applyAscendEntitlements(access, userData) {
  const isVerified = Boolean(userData?.verified || userData?.owner || userData?.contributor);
  const isSubscribed = userData?.ascendSubscription?.active === true;
  if (!isVerified && !isSubscribed) return access;

  return {
    ...access,
    hasAccess: true,
    daysRemaining: -1,
    isSubscribed: !isVerified && isSubscribed,
    isVerified,
    verified: true,
    trialBlocked: false,
    noTrial: false,
    noTrialReason: null,
    error: null,
  };
}
