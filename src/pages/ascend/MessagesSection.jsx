import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cleanupAllOldMessages } from "@/services/firebaseService";
import {
  User,
  Users,
  Loader2,
  MessageCircle,
  Check,
  Send,
  ArrowLeft,
  Trash2,
  Crown,
  BadgeCheck,
  Hammer,
  CheckCheck,
} from "lucide-react";

export default function MessagesSection({
  t,
  loadingConversations,
  conversations,
  handleSelectConversation,
  selectedConversation,
  user,
  setActiveSection,
  setSelectedConversation,
  handleViewProfile,
  loadingMessages,
  messages,
  messagesEndRef,
  handleSendMessage,
  messageInput,
  setMessageInput,
  sendingMessage,
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-violet-500/10 p-6">
        <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{t("ascend.messages.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("ascend.messages.subtitle") || "Messages from the last 7 days"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const result = await cleanupAllOldMessages();
                  if (result.success && result.totalDeleted > 0) {
                    toast.success(
                      t("ascend.messages.cleanedUp") ||
                        `Cleaned up ${result.totalDeleted} old messages`
                    );
                  }
                }}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {t("ascend.messages.cleanup") || "Cleanup"}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Conversations list */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm">
            <div className="border-b border-border/30 p-4">
              <h2 className="font-semibold">{t("ascend.messages.conversations")}</h2>
            </div>
            <div className="max-h-[calc(100vh-400px)] min-h-[300px] overflow-y-auto p-2">
              {loadingConversations ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : conversations.length > 0 ? (
                <div className="space-y-1">
                  {conversations.map(conversation => (
                    <button
                      key={conversation.id}
                      onClick={() => handleSelectConversation(conversation)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${
                        selectedConversation?.id === conversation.id
                          ? "bg-primary/15 ring-1 ring-primary/30"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-md">
                          {conversation.otherUser.photoURL ? (
                            <img
                              src={conversation.otherUser.photoURL}
                              alt=""
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-sm font-bold text-secondary">
                              {conversation.otherUser.displayName?.[0]?.toUpperCase() ||
                                "U"}
                            </span>
                          )}
                        </div>
                        <div
                          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card shadow-sm ${
                            conversation.otherUser.status === "online"
                              ? "bg-green-500"
                              : conversation.otherUser.status === "away"
                                ? "bg-yellow-500"
                                : conversation.otherUser.status === "busy"
                                  ? "bg-red-500"
                                  : "bg-gray-400"
                          }`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex items-center gap-1 truncate text-sm font-semibold">
                            {conversation.otherUser.displayName}
                            {conversation.otherUser.owner && (
                              <Crown className="h-3 w-3 shrink-0 text-yellow-500" />
                            )}
                            {conversation.otherUser.contributor && (
                              <Hammer className="h-3 w-3 shrink-0 text-orange-500" />
                            )}
                            {conversation.otherUser.verified && (
                              <BadgeCheck className="h-3 w-3 shrink-0 text-blue-500" />
                            )}
                          </p>
                          {conversation.unreadCount > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-secondary">
                              {conversation.unreadCount}
                            </span>
                          )}
                        </div>
                        {conversation.lastMessage && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {conversation.lastMessageSenderId === user?.uid
                              ? `${t("ascend.messages.you")}: `
                              : ""}
                            {conversation.lastMessage}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                    <MessageCircle className="h-7 w-7 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium">{t("ascend.messages.empty")}</p>
                  <p className="mb-3 mt-1 text-xs text-muted-foreground">
                    {t("ascend.messages.emptyHint")}
                  </p>
                  <Button size="sm" onClick={() => setActiveSection("friends")}>
                    <Users className="mr-2 h-3.5 w-3.5" />
                    {t("ascend.messages.startChat")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div className="lg:col-span-2">
          <div className="flex h-[calc(100vh-340px)] min-h-[400px] flex-col rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm">
            {selectedConversation ? (
              <>
                {/* Chat header */}
                <div className="flex items-center gap-4 border-b border-border/30 px-5 py-4">
                  <button
                    onClick={() => setSelectedConversation(null)}
                    className="rounded-lg p-2 transition-colors hover:bg-muted/50 lg:hidden"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-md">
                      {selectedConversation.otherUser.photoURL ? (
                        <img
                          src={selectedConversation.otherUser.photoURL}
                          alt=""
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-sm font-bold text-secondary">
                          {selectedConversation.otherUser.displayName?.[0]?.toUpperCase() ||
                            "U"}
                        </span>
                      )}
                    </div>
                    <div
                      className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${
                        selectedConversation.otherUser.status === "online"
                          ? "bg-green-500"
                          : selectedConversation.otherUser.status === "away"
                            ? "bg-yellow-500"
                            : selectedConversation.otherUser.status === "busy"
                              ? "bg-red-500"
                              : "bg-gray-400"
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="flex items-center gap-1 font-semibold">
                      {selectedConversation.otherUser.displayName}
                      {selectedConversation.otherUser.owner && (
                        <Crown className="h-4 w-4 shrink-0 text-yellow-500" />
                      )}
                      {selectedConversation.otherUser.contributor && (
                        <Hammer className="h-4 w-4 shrink-0 text-orange-500" />
                      )}
                      {selectedConversation.otherUser.verified && (
                        <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" />
                      )}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          selectedConversation.otherUser.status === "online"
                            ? "bg-green-500"
                            : "bg-gray-400"
                        }`}
                      />
                      {selectedConversation.otherUser.status === "online"
                        ? t("ascend.messages.online")
                        : t("ascend.messages.offline")}
                      {selectedConversation.otherUser.customMessage && (
                        <span className="ml-2 text-muted-foreground/70">
                          — {selectedConversation.otherUser.customMessage}
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleViewProfile(selectedConversation.otherUser.uid)}
                    className="h-9 w-9"
                  >
                    <User className="h-4 w-4" />
                  </Button>
                </div>

                {/* Messages area */}
                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {loadingMessages ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : messages.length > 0 ? (
                    <>
                      {/* Date separator for first message */}
                      <div className="flex items-center justify-center py-2">
                        <span className="rounded-full bg-muted/50 px-3 py-1 text-[10px] font-medium text-muted-foreground">
                          {t("ascend.messages.last7Days") ||
                            "Messages from the last 7 days"}
                        </span>
                      </div>
                      {messages.map((message, index) => {
                        const showAvatar =
                          !message.isOwn && (index === 0 || messages[index - 1]?.isOwn);
                        const showDate =
                          index === 0 ||
                          message.createdAt?.toDateString() !==
                            messages[index - 1]?.createdAt?.toDateString();
                        return (
                          <React.Fragment key={message.id}>
                            {showDate && index > 0 && (
                              <div className="flex items-center justify-center py-2">
                                <span className="rounded-full bg-muted/30 px-3 py-1 text-[10px] font-medium text-muted-foreground">
                                  {message.createdAt?.toLocaleDateString(undefined, {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              </div>
                            )}
                            <div
                              className={`flex items-end gap-2 ${message.isOwn ? "justify-end" : "justify-start"}`}
                            >
                              {!message.isOwn && (
                                <div
                                  className={`h-7 w-7 shrink-0 ${showAvatar ? "" : "invisible"}`}
                                >
                                  <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/60">
                                    {selectedConversation.otherUser.photoURL ? (
                                      <img
                                        src={selectedConversation.otherUser.photoURL}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <span className="text-[10px] font-bold text-secondary">
                                        {selectedConversation.otherUser.displayName?.[0]?.toUpperCase() ||
                                          "U"}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                              <div
                                className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                                  message.isOwn
                                    ? "rounded-br-md bg-gradient-to-br from-primary to-primary/90 text-secondary shadow-md"
                                    : "rounded-bl-md bg-muted/60"
                                }`}
                              >
                                <p className="text-sm leading-relaxed">{message.text}</p>
                                <div
                                  className={`mt-1 flex items-center gap-1 text-[10px] ${
                                    message.isOwn
                                      ? "text-secondary/60"
                                      : "text-muted-foreground/60"
                                  }`}
                                >
                                  <span>
                                    {message.createdAt?.toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                  {message.isOwn && (
                                    <span className="ml-1">
                                      {message.read ? (
                                        <CheckCheck className="h-3 w-3" />
                                      ) : (
                                        <Check className="h-3 w-3" />
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                        <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("ascend.messages.noMessages")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {t("ascend.messages.startConversation") ||
                          "Send a message to start the conversation"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Message input */}
                <div className="border-t border-border/30 p-4">
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                    className="flex items-center gap-3"
                  >
                    <Input
                      value={messageInput}
                      onChange={e => setMessageInput(e.target.value)}
                      placeholder={t("ascend.messages.placeholder")}
                      className="h-11 flex-1 rounded-xl border-border/30 bg-muted/30 focus-visible:ring-primary/30"
                      disabled={sendingMessage}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!messageInput.trim() || sendingMessage}
                      className="h-11 w-11 shrink-0 rounded-xl text-secondary shadow-md"
                    >
                      {sendingMessage ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20">
                  <MessageCircle className="h-10 w-10 text-primary/60" />
                </div>
                <p className="text-lg font-semibold">
                  {t("ascend.messages.selectConversation")}
                </p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  {t("ascend.messages.selectHint") ||
                    "Choose a conversation from the list to start chatting"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
