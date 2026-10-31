import { Fragment, useState } from "react";
import ProfileImage, { getInitial } from "@/components/ProfileImage";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Cloud,
  EyeOff,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquarePlus,
  Search,
  Send,
  ShieldAlert,
  User,
  Users,
} from "lucide-react";
import EarnedBadges from "@/components/EarnedBadges";

const statusColors = {
  online: "bg-emerald-500",
  away: "bg-amber-400",
  busy: "bg-red-500",
};

// Messages from the same sender this close together share one bubble group
const GROUP_GAP_MS = 5 * 60 * 1000;

// Per account, like the welcome tour, so each account sees the notice once
const messagingNoticeKey = uid => `ascendara:messagingNoticeSeen:${uid}`;

const hasSeenMessagingNotice = uid => {
  try {
    return localStorage.getItem(messagingNoticeKey(uid)) === "true";
  } catch {
    return true;
  }
};

const markMessagingNoticeSeen = uid => {
  if (!uid) return;
  try {
    localStorage.setItem(messagingNoticeKey(uid), "true");
  } catch {}
};

function Avatar({ person, size = "h-10 w-10", ring = "border-background" }) {
  return (
    <div className="relative shrink-0">
      <div
        className={`flex ${size} items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary`}
      >
        <ProfileImage
          src={person.photoURL}
          className="h-full w-full object-cover"
          fallback={getInitial(person.displayName)}
        />
      </div>
      <span
        aria-hidden="true"
        className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 ${ring} ${statusColors[person.status] || "bg-muted-foreground/60"}`}
      />
    </div>
  );
}

function PersonName({ person }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{person.displayName}</span>
      <EarnedBadges user={person} className="h-3.5 w-3.5" />
    </span>
  );
}

const sameGroup = (a, b) =>
  a &&
  b &&
  a.isOwn === b.isOwn &&
  a.createdAt?.toDateString() === b.createdAt?.toDateString() &&
  Math.abs((b.createdAt || 0) - (a.createdAt || 0)) < GROUP_GAP_MS;

const formatListTime = date => {
  if (!date) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (now - date < 6 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function MessagingNoticeDialog({ t, open, firstTime, onAccept, onDecline }) {
  const points = [
    {
      icon: Cloud,
      title: t("ascend.messages.notice.firebaseTitle", {
        defaultValue: "Sent through Google Firebase",
      }),
      body: t("ascend.messages.notice.firebaseBody", {
        defaultValue:
          "Messages are delivered and stored with Google Firebase so they reach your friend in real time and show up on any device you sign in on.",
      }),
    },
    {
      icon: Lock,
      title: t("ascend.messages.notice.encryptionTitle", {
        defaultValue: "Not end-to-end encrypted",
      }),
      body: t("ascend.messages.notice.encryptionBody", {
        defaultValue:
          "Google encrypts messages in transit and on its servers, but they are not end-to-end encrypted, so they are stored in a form the service can access.",
      }),
    },
    {
      icon: EyeOff,
      title: t("ascend.messages.notice.privacyTitle", {
        defaultValue: "Never read by Ascendara",
      }),
      body: t("ascend.messages.notice.privacyBody", {
        defaultValue:
          "Ascendara does not read, scan, or review your messages, and never uses them for analytics or advertising.",
      }),
    },
    {
      icon: ShieldAlert,
      title: t("ascend.messages.notice.sensitiveTitle", {
        defaultValue: "Keep sensitive details out",
      }),
      body: t("ascend.messages.notice.sensitiveBody", {
        defaultValue:
          "Don't send passwords, payment details, or anything you need kept strictly private.",
      }),
    },
  ];

  return (
    <AlertDialog open={open} onOpenChange={next => !next && onDecline()}>
      <AlertDialogContent className="max-w-md gap-6 rounded-2xl">
        <AlertDialogHeader className="space-y-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageCircle className="h-5 w-5" />
          </div>
          <AlertDialogTitle>
            {t("ascend.messages.notice.title", {
              defaultValue: "How messages work",
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("ascend.messages.notice.description", {
              defaultValue:
                "A quick note on where your messages go before you start chatting.",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-4">
          {points.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => window.electron?.openURL("https://ascendara.app/ascend/privacy")}
          className="w-fit text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("ascend.messages.notice.policyLink", {
            defaultValue: "Read the Ascend Privacy Policy",
          })}
        </button>
        <AlertDialogFooter>
          {firstTime && (
            <Button variant="ghost" onClick={onDecline}>
              {t("ascend.messages.notice.decline", { defaultValue: "Not now" })}
            </Button>
          )}
          <Button onClick={onAccept} className="text-secondary">
            {t("ascend.messages.notice.accept", { defaultValue: "Got it" })}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  const [noticeSeen, setNoticeSeen] = useState(() => hasSeenMessagingNotice(user?.uid));
  const [noticeReopened, setNoticeReopened] = useState(false);
  const filteredConversations = conversations.filter(conversation =>
    (conversation.otherUser.displayName || "")
      .toLocaleLowerCase()
      .includes(filter.trim().toLocaleLowerCase())
  );
  const otherUser = selectedConversation?.otherUser;
  const send = () => {
    if (noticeSeen && !sendingMessage && !loadingMessages && messageInput.trim())
      handleSendMessage();
  };
  // Only the latest own message carries the delivery state
  const lastOwnId = [...messages].reverse().find(message => message.isOwn)?.id;

  const acceptNotice = () => {
    markMessagingNoticeSeen(user?.uid);
    setNoticeSeen(true);
    setNoticeReopened(false);
  };
  const declineNotice = () => {
    if (noticeSeen) setNoticeReopened(false);
    else setSelectedConversation(null);
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] md:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[21rem_minmax(0,1fr)]">
      <aside
        aria-label={t("ascend.messages.conversations")}
        className={`min-h-0 flex-col md:border-r md:border-border/40 md:pr-5 ${selectedConversation ? "hidden md:flex" : "flex"}`}
      >
        <div className="shrink-0 space-y-5 pb-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("ascend.messages.title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("ascend.messages.conversationCount", {
                  count: conversations.length,
                })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActiveSection("friends")}
              aria-label={t("ascend.messages.startChat")}
              title={t("ascend.messages.startChat")}
              className="h-9 w-9 rounded-full text-primary hover:bg-primary/10"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={filter}
              onChange={event => setFilter(event.target.value)}
              aria-label={t("ascend.messages.searchConversations", {
                defaultValue: "Search conversations",
              })}
              placeholder={t("ascend.messages.searchConversations", {
                defaultValue: "Search conversations",
              })}
              className="h-10 w-full border-b border-border/50 bg-transparent pl-7 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
        </div>
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          {loadingConversations ? (
            <div
              role="status"
              aria-label={t("common.loading", { defaultValue: "Loading" })}
              className="flex justify-center py-12"
            >
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filteredConversations.length ? (
            filteredConversations.map(conversation => {
              const active = selectedConversation?.id === conversation.id;
              const unread = conversation.unreadCount > 0;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => handleSelectConversation(conversation)}
                  aria-current={active ? "true" : undefined}
                  className={`relative flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${active ? "bg-muted/60" : "hover:bg-muted/30"}`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute -left-2 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                    />
                  )}
                  <Avatar person={conversation.otherUser} ring="border-background" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <div
                        className={`min-w-0 flex-1 text-sm ${unread ? "font-semibold" : "font-medium"}`}
                      >
                        <PersonName person={conversation.otherUser} />
                      </div>
                      <span
                        className={`shrink-0 text-[11px] tabular-nums ${unread ? "font-medium text-primary" : "text-muted-foreground"}`}
                      >
                        {formatListTime(conversation.lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p
                        className={`min-w-0 flex-1 truncate text-xs ${unread ? "font-medium text-foreground" : "text-muted-foreground"}`}
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
                      {unread && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-secondary">
                          {conversation.unreadCount > 99
                            ? "99+"
                            : conversation.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-2 py-10">
              <p className="text-sm font-medium">
                {filter.trim()
                  ? t("ascend.messages.noSearchResults", {
                      defaultValue: "No conversations found",
                    })
                  : t("ascend.messages.empty")}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
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
                  className="mt-4 rounded-full"
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
        className={`min-h-0 min-w-0 flex-col md:pl-8 ${selectedConversation ? "flex" : "hidden md:flex"}`}
      >
        {otherUser ? (
          <>
            <header className="flex shrink-0 items-center gap-4 border-b border-border/40 pb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedConversation(null)}
                aria-label={t("ascend.messages.conversations")}
                className="-ml-2 h-8 w-8 shrink-0 md:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={() => handleViewProfile(otherUser.uid)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Avatar person={otherUser} size="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold">
                    <PersonName person={otherUser} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {t(
                      `ascend.status.${["online", "away", "busy"].includes(otherUser.status) ? otherUser.status : "offline"}`
                    )}
                    {otherUser.customMessage && <> · {otherUser.customMessage}</>}
                  </p>
                </div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleViewProfile(otherUser.uid)}
                aria-label={t("ascend.profile.viewProfile", {
                  defaultValue: "View profile",
                })}
                title={t("ascend.profile.viewProfile", { defaultValue: "View profile" })}
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground"
              >
                <User className="h-4 w-4" />
              </Button>
            </header>

            <div
              data-message-scroll
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 pr-1"
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
                  const next = messages[index + 1];
                  const showDate =
                    !previous ||
                    message.createdAt?.toDateString() !==
                      previous.createdAt?.toDateString();
                  const groupedWithPrevious = !showDate && sameGroup(previous, message);
                  const endsGroup = !sameGroup(message, next);
                  const corner = message.isOwn ? "rounded-br-md" : "rounded-bl-md";
                  return (
                    <Fragment key={message.id}>
                      {showDate && (
                        <div className="py-5 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {message.createdAt?.toLocaleDateString(undefined, {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      )}
                      <div
                        className={`flex ${message.isOwn ? "justify-end" : "justify-start"} ${groupedWithPrevious ? "mt-1" : "mt-3"}`}
                      >
                        <div
                          className={`flex min-w-0 max-w-[85%] flex-col sm:max-w-[70%] ${message.isOwn ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`rounded-3xl px-4 py-2.5 text-sm leading-relaxed ${endsGroup ? corner : ""} ${message.isOwn ? "bg-primary text-secondary" : "bg-muted/70 text-foreground"}`}
                          >
                            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                              {message.text}
                            </p>
                          </div>
                          {(endsGroup || message.id === lastOwnId) && (
                            <div className="mt-1 px-2 text-[10px] tabular-nums text-muted-foreground">
                              {message.createdAt?.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {message.id === lastOwnId && (
                                <span
                                  className={message.read ? "text-primary" : undefined}
                                >
                                  {" · "}
                                  {message.read
                                    ? t("ascend.messages.seen", { defaultValue: "Seen" })
                                    : t("ascend.messages.delivered", {
                                        defaultValue: "Delivered",
                                      })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Fragment>
                  );
                })
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <Avatar person={otherUser} size="h-16 w-16" />
                  <p className="mt-4 text-base font-semibold">
                    <PersonName person={otherUser} />
                  </p>
                  <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
                    {t("ascend.messages.noMessages")}
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
              className="shrink-0 pt-2"
            >
              <div className="flex items-end gap-2 rounded-3xl border border-border/50 bg-muted/30 py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-primary/50 focus-within:bg-muted/40">
                <textarea
                  rows={1}
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
                  readOnly={sendingMessage || !noticeSeen}
                  className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 text-sm leading-6 text-foreground caret-primary outline-none [field-sizing:content] placeholder:text-muted-foreground"
                />
                <Button
                  type="submit"
                  disabled={
                    !messageInput.trim() ||
                    sendingMessage ||
                    loadingMessages ||
                    !noticeSeen
                  }
                  aria-label={t("ascend.messages.send", { defaultValue: "Send message" })}
                  className="h-10 w-10 shrink-0 rounded-full p-0 text-secondary"
                >
                  {sendingMessage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setNoticeReopened(true)}
                className="mx-auto mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <Lock aria-hidden="true" className="h-3 w-3" />
                {t("ascend.messages.notice.footer", {
                  defaultValue: "Sent through Firebase, not end-to-end encrypted",
                })}
              </button>
            </form>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
            <MessageCircle className="h-10 w-10 text-primary/50" strokeWidth={1.5} />
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">
              {t("ascend.messages.selectConversation")}
            </h2>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t("ascend.messages.selectHint", {
                defaultValue: "Choose a conversation from the list to start chatting",
              })}
            </p>
            <Button
              variant="outline"
              onClick={() => setActiveSection("friends")}
              className="mt-6 gap-2 rounded-full"
            >
              <MessageSquarePlus className="h-4 w-4" />
              {t("ascend.messages.startChat")}
            </Button>
          </div>
        )}
      </section>

      <MessagingNoticeDialog
        t={t}
        open={Boolean(otherUser && !noticeSeen) || noticeReopened}
        firstTime={!noticeSeen}
        onAccept={acceptNotice}
        onDecline={declineNotice}
      />
    </div>
  );
}
