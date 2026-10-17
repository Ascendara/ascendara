import SectionHeader from "./SectionHeader";
import { Panel } from "./primitives";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, Check, X, Send, UserCheck, Inbox } from "lucide-react";

function RequestList({ icon: Icon, title, emptyIcon: EmptyIcon, emptyTitle, emptyHint, children, count }) {
  return (
    <Panel className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ml-auto rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      {count > 0 ? (
        <ul className="divide-y divide-border/40">{children}</ul>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <EmptyIcon className="h-6 w-6 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">{emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground/80">{emptyHint}</p>
        </div>
      )}
    </Panel>
  );
}

function RequestRow({ name, subtitle, index, children }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
      className="flex items-center gap-3 px-4 py-3"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-secondary">
        {name?.[0]?.toUpperCase() || "U"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </motion.li>
  );
}

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
      <SectionHeader
        title={t("ascend.requests.title")}
        description={t("ascend.requests.subtitle", {
          defaultValue: "Manage your friend requests",
        })}
        actions={
          <Button
            onClick={() => setActiveSection("search")}
            className="gap-2 rounded-xl text-secondary"
          >
            <UserPlus className="h-4 w-4" />
            {t("ascend.friends.addFriend")}
          </Button>
        }
      />

      {loadingRequests ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <RequestList
            icon={UserCheck}
            title={t("ascend.requests.incoming")}
            count={incomingRequests.length}
            emptyIcon={Inbox}
            emptyTitle={t("ascend.requests.noIncoming")}
            emptyHint={t("ascend.requests.empty")}
          >
            {incomingRequests.map((request, index) => (
              <RequestRow
                key={request.id}
                index={index}
                name={request.fromDisplayName}
                subtitle={t("ascend.requests.wantsToAdd")}
              >
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-secondary"
                  onClick={() => handleAcceptRequest(request.id, request.fromUid)}
                >
                  <Check className="h-3.5 w-3.5" />
                  {t("ascend.requests.accept")}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500"
                  onClick={() => handleDenyRequest(request.id)}
                  aria-label={t("ascend.requests.deny", { defaultValue: "Decline" })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </RequestRow>
            ))}
          </RequestList>

          <RequestList
            icon={Send}
            title={t("ascend.requests.outgoing")}
            count={outgoingRequests.length}
            emptyIcon={Send}
            emptyTitle={t("ascend.requests.noOutgoing")}
            emptyHint={t("ascend.search.hint")}
          >
            {outgoingRequests.map((request, index) => (
              <RequestRow
                key={request.id}
                index={index}
                name={request.toDisplayName}
                subtitle={t("ascend.requests.pending")}
              >
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => handleDenyRequest(request.id)}
                >
                  {t("ascend.requests.cancel")}
                </Button>
              </RequestRow>
            ))}
          </RequestList>
        </div>
      )}
    </div>
  );
}
