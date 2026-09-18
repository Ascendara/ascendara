import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Sparkles,
  Search,
  UserPlus,
  Check,
  X,
  Clock,
  Send,
  UserCheck,
  Inbox,
} from "lucide-react";

export default function RequestsSection({
  t,
  setActiveSection,
  incomingRequests,
  outgoingRequests,
  loadingRequests,
  handleAcceptRequest,
  handleDenyRequest,
}) {
  return (
    <div className="mb-24 space-y-6">
      {/* Header with gradient background */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-primary/10 p-6">
        <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 backdrop-blur-sm">
                <UserPlus className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{t("ascend.requests.title")}</h1>
                <p className="text-sm text-muted-foreground">
                  {t("ascend.friends.subtitle") || "Manage your friend requests"}
                </p>
              </div>
            </div>
            <Button
              onClick={() => setActiveSection("search")}
              className="gap-2 text-secondary"
            >
              <Search className="h-4 w-4" />
              {t("ascend.friends.findFriends")}
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border/50 bg-card/50 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <UserCheck className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{incomingRequests.length}</p>
              <p className="text-xs text-muted-foreground">
                {t("ascend.requests.incoming")}
              </p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border border-border/50 bg-card/50 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Send className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{outgoingRequests.length}</p>
              <p className="text-xs text-muted-foreground">
                {t("ascend.requests.outgoing")}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {loadingRequests ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Incoming Requests */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border/50" />
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <UserCheck className="h-4 w-4 text-green-500" />
                {t("ascend.requests.incoming")}
              </h2>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            {incomingRequests.length > 0 ? (
              <div className="space-y-3">
                {incomingRequests.map((request, index) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-all duration-300 hover:border-green-500/30 hover:bg-card hover:shadow-lg hover:shadow-green-500/5"
                  >
                    <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-green-500/5 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />
                    <div className="relative flex items-center justify-between p-5">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-green-500 via-green-500/90 to-emerald-500 shadow-lg shadow-green-500/20">
                            <span className="text-xl font-bold text-white">
                              {request.fromDisplayName?.[0]?.toUpperCase() || "U"}
                            </span>
                          </div>
                          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-green-500">
                            <UserPlus className="h-3 w-3 text-white" />
                          </div>
                        </div>
                        <div>
                          <p className="text-lg font-semibold">
                            {request.fromDisplayName}
                          </p>
                          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                            {t("ascend.requests.wantsToAdd")}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="gap-2 rounded-xl bg-green-500 text-white hover:bg-green-600"
                          size="sm"
                          onClick={() => handleAcceptRequest(request.id, request.fromUid)}
                        >
                          <Check className="h-4 w-4" />
                          {t("ascend.requests.accept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => handleDenyRequest(request.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-8 text-center"
              >
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10">
                  <Inbox className="h-7 w-7 text-green-500/50" />
                </div>
                <p className="font-medium text-muted-foreground">
                  {t("ascend.requests.noIncoming")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground/70">
                  {t("ascend.requests.empty") || "New requests will appear here"}
                </p>
              </motion.div>
            )}
          </div>

          {/* Outgoing Requests */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border/50" />
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Send className="h-4 w-4 text-blue-500" />
                {t("ascend.requests.outgoing")}
              </h2>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            {outgoingRequests.length > 0 ? (
              <div className="space-y-3">
                {outgoingRequests.map((request, index) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-all duration-300 hover:border-blue-500/30 hover:bg-card hover:shadow-lg hover:shadow-blue-500/5"
                  >
                    <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-blue-500/5 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />
                    <div className="relative flex items-center justify-between p-5">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-blue-500/90 to-indigo-500 shadow-lg shadow-blue-500/20">
                            <span className="text-xl font-bold text-white">
                              {request.toDisplayName?.[0]?.toUpperCase() || "U"}
                            </span>
                          </div>
                          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-blue-500">
                            <Send className="h-3 w-3 text-white" />
                          </div>
                        </div>
                        <div>
                          <p className="text-lg font-semibold">{request.toDisplayName}</p>
                          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5 text-blue-500" />
                            {t("ascend.requests.pending")}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl"
                        onClick={() => handleDenyRequest(request.id)}
                      >
                        <X className="mr-1.5 h-4 w-4" />
                        {t("ascend.requests.cancel")}
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-8 text-center"
              >
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
                  <Send className="h-7 w-7 text-blue-500/50" />
                </div>
                <p className="font-medium text-muted-foreground">
                  {t("ascend.requests.noOutgoing")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground/70">
                  {t("ascend.search.hint") || "Search for users to send friend requests"}
                </p>
              </motion.div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
