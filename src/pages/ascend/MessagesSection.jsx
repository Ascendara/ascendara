import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCheck,
  Crown,
  Hammer,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  Search,
  Send,
  User,
  Users,
} from "lucide-react";

const statusColors = {
  online: "bg-emerald-500",
  away: "bg-amber-400",
  busy: "bg-red-500",
};

function Avatar({ person }) {
  return (
    <div className="relative shrink-0">
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-sm font-semibold text-primary ring-1 ring-border/50">
        {person.photoURL ? (
          <>
            <img
              src={person.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              onError={event => {
                event.currentTarget.style.display = "none";
                event.currentTarget.nextElementSibling?.classList.remove("hidden");
              }}
              className="h-full w-full object-cover"
            />
            <User className="hidden h-5 w-5 text-primary" aria-hidden="true" />
          </>
        ) : (
          <User className="h-5 w-5 text-primary" aria-hidden="true" />
        )}
      </div>
      <span
        aria-hidden="true"
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${statusColors[person.status] || "bg-muted-foreground"}`}
      />
    </div>
  );
}

function PersonName({ person }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{person.displayName}</span>
      {person.owner && <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />}
      {person.contributor && <Hammer className="h-3.5 w-3.5 shrink-0 text-orange-500" />}
      {person.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />}
    </span>
  );
}

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
  const [filter, setFilter] = useState("");
  const filteredConversations = conversations.filter(conversation =>
    (conversation.otherUser.displayName || "")
      .toLocaleLowerCase()
      .includes(filter.trim().toLocaleLowerCase())
  );
  const otherUser = selectedConversation?.otherUser;
  const send = () => {
    if (!sendingMessage && !loadingMessages && messageInput.trim()) handleSendMessage();
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm md:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
      <aside
        aria-label={t("ascend.messages.conversations")}
        className={`min-h-0 flex-col border-border/60 bg-muted/10 md:border-r ${selectedConversation ? "hidden md:flex" : "flex"}`}
      >
        <div className="shrink-0 space-y-5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">
                {t("ascend.messages.title")}
              </h1>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 mb-3 text-xs font-medium tabular-nums text-primary">
                {conversations.length}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActiveSection("friends")}
              aria-label={t("ascend.messages.startChat")}
              title={t("ascend.messages.startChat")}
              className="h-8 w-8 rounded-lg text-primary"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={filter}
              onChange={event => setFilter(event.target.value)}
              aria-label={t("ascend.messages.searchConversations", {
                defaultValue: "Search conversations",
              })}
              placeholder={t("ascend.messages.searchConversations", {
                defaultValue: "Search conversations",
              })}
              className="h-10 rounded-xl border-border/60 bg-background pl-9 shadow-none"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          {loadingConversations ? (
            <div
              role="status"
              aria-label={t("common.loading", { defaultValue: "Loading" })}
              className="flex justify-center py-12"
            >
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filteredConversations.length ? (
            filteredConversations.map(conversation => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => handleSelectConversation(conversation)}
                aria-current={
                  selectedConversation?.id === conversation.id ? "true" : undefined
                }
                className={`mb-1 flex w-full items-center gap-3 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${selectedConversation?.id === conversation.id ? "border-primary/20 bg-primary/10" : "border-transparent hover:bg-muted/50"}`}
              >
                <Avatar person={conversation.otherUser} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    <PersonName person={conversation.otherUser} />
                  </div>
                  <p
                    className={`mt-1 truncate text-xs ${conversation.unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    {conversation.lastMessage ? (
                      <>
                        {conversation.lastMessageSenderId === user?.uid
                          ? `${t("ascend.messages.you")}: `
                          : ""}
                        {conversation.lastMessage}
                      </>
                    ) : (
                      t("ascend.messages.startConversation", {
                        defaultValue: "Send a message to start the conversation",
                      })
                    )}
                  </p>
                </div>
                {conversation.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-secondary">
                    {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                  </span>
                )}
              </button>
            ))
          ) : (
            <div className="px-4 py-10 text-center">
              <MessageCircle className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">
                {filter.trim()
                  ? t("ascend.messages.noSearchResults", {
                      defaultValue: "No conversations found",
                    })
                  : t("ascend.messages.empty")}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {filter.trim()
                  ? t("ascend.messages.tryAnotherName", {
                      defaultValue: "Try another name.",
                    })
                  : t("ascend.messages.emptyHint")}
              </p>
              {!filter.trim() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveSection("friends")}
                  className="mt-4 rounded-lg"
                >
                  <Users className="mr-2 h-3.5 w-3.5" />
                  {t("ascend.messages.startChat")}
                </Button>
              )}
            </div>
          )}
        </div>
      </aside>

      <section
        aria-label={t("ascend.messages.title")}
        className={`min-h-0 min-w-0 flex-col bg-background/50 ${selectedConversation ? "flex" : "hidden md:flex"}`}
      >
        {otherUser ? (
          <>
            <header className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-4 sm:px-6">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedConversation(null)}
                aria-label={t("ascend.messages.conversations")}
                className="h-8 w-8 shrink-0 md:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Avatar person={otherUser} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  <PersonName person={otherUser} />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {t(
                    `ascend.status.${["online", "away", "busy"].includes(otherUser.status) ? otherUser.status : "offline"}`
                  )}
                  {otherUser.customMessage && <> ? {otherUser.customMessage}</>}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleViewProfile(otherUser.uid)}
                aria-label={t("ascend.profile.viewProfile", {
                  defaultValue: "View profile",
                })}
                title={t("ascend.profile.viewProfile", { defaultValue: "View profile" })}
                className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground"
              >
                <User className="h-4 w-4" />
              </Button>
            </header>

            <div
              data-message-scroll
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
            >
              {loadingMessages ? (
                <div
                  role="status"
                  aria-label={t("common.loading", { defaultValue: "Loading" })}
                  className="flex h-full items-center justify-center"
                >
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : messages.length ? (
                messages.map((message, index) => {
                  const previous = messages[index - 1];
                  const showDate =
                    !previous ||
                    message.createdAt?.toDateString() !==
                      previous.createdAt?.toDateString();
                  const grouped =
                    previous && previous.isOwn === message.isOwn && !showDate;
                  return (
                    <Fragment key={message.id}>
                      {showDate && (
                        <div className="flex items-center gap-4 py-5">
                          <div className="h-px flex-1 bg-border/40" />
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {message.createdAt?.toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          <div className="h-px flex-1 bg-border/40" />
                        </div>
                      )}
                      <div
                        className={`flex ${message.isOwn ? "justify-end" : "justify-start"} ${grouped ? "mt-1.5" : "mt-4"}`}
                      >
                        <div className="min-w-0 max-w-[85%] sm:max-w-[75%]">
                          <div
                            className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed text-foreground ${message.isOwn ? "rounded-br-sm border-primary/20 bg-primary/10" : "rounded-bl-sm border-border/60 bg-card"}`}
                          >
                            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                              {message.text}
                            </p>
                          </div>
                          <div
                            className={`mt-1.5 flex items-center gap-1 px-1 text-[10px] tabular-nums text-muted-foreground ${message.isOwn ? "justify-end" : ""}`}
                          >
                            <span>
                              {message.createdAt?.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {message.isOwn &&
                              (message.read ? (
                                <CheckCheck
                                  aria-label={t("ascend.messages.read", {
                                    defaultValue: "Read",
                                  })}
                                  className="h-3 w-3 text-primary"
                                />
                              ) : (
                                <Check
                                  aria-label={t("ascend.messages.sent", {
                                    defaultValue: "Sent",
                                  })}
                                  className="h-3 w-3"
                                />
                              ))}
                          </div>
                        </div>
                      </div>
                    </Fragment>
                  );
                })
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <MessageCircle className="mb-4 h-8 w-8 text-primary/60" />
                  <p className="text-sm font-medium">{t("ascend.messages.noMessages")}</p>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                    {t("ascend.messages.startConversation", {
                      defaultValue: "Send a message to start the conversation",
                    })}
                  </p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={event => {
                event.preventDefault();
                send();
              }}
              className="shrink-0 border-t border-border/50 bg-card p-3 sm:p-4"
            >
              <div className="flex items-end gap-3 rounded-xl border border-input bg-background p-2 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
                <textarea
                  rows={2}
                  value={messageInput}
                  onChange={event => setMessageInput(event.target.value)}
                  onKeyDown={event => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      send();
                    }
                  }}
                  aria-label={t("ascend.messages.placeholder")}
                  placeholder={t("ascend.messages.placeholder")}
                  readOnly={sendingMessage}
                  className="min-h-12 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground caret-primary outline-none placeholder:text-muted-foreground"
                />
                <Button
                  type="submit"
                  disabled={!messageInput.trim() || sendingMessage || loadingMessages}
                  aria-label={t("ascend.messages.send", { defaultValue: "Send message" })}
                  className="h-10 w-10 shrink-0 rounded-lg p-0 text-secondary"
                >
                  {sendingMessage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5 text-primary">
              <MessageCircle className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              {t("ascend.messages.selectConversation")}
            </h2>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t("ascend.messages.selectHint", {
                defaultValue: "Choose a conversation from the list to start chatting",
              })}
            </p>
            <Button
              variant="outline"
              onClick={() => setActiveSection("friends")}
              className="mt-6 gap-2 rounded-xl"
            >
              <MessageSquarePlus className="h-4 w-4" />
              {t("ascend.messages.startChat")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
