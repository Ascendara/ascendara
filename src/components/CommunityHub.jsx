import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  requestCommunityCreation,
  getUserCommunityRequests,
  getApprovedCommunities,
  getCommunity,
  requestJoinCommunity,
  getCommunityJoinRequests,
  getCommunityMembers,
  sendCommunityMessage,
  getCommunityMessages,
  subscribeToCommunityMessages,
  checkCommunityMembership,
  getUserCommunities,
} from "@/services/firebaseService";
import {
  Users,
  MessageCircle,
  Plus,
  Search,
  Send,
  Crown,
  Shield,
  UserPlus,
  UserMinus,
  Loader2,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Gamepad2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CommunityHub = ({ user, userData }) => {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState("browse"); // browse, create, community
  const [communities, setCommunities] = useState([]);
  const [userCommunities, setUserCommunities] = useState([]);
  const [userRequests, setUserRequests] = useState([]);
  const [selectedCommunity, setSelectedCommunity] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [hasPendingRequests, setHasPendingRequests] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const messagesEndRef = useRef(null);
  const messageUnsubscribeRef = useRef(null);

  // Create community form state
  const [createForm, setCreateForm] = useState({
    gameId: "",
    name: "",
    description: "",
    iconUrl: "",
  });

  useEffect(() => {
    if (user) {
      loadCommunities();
      loadUserCommunities();
      loadUserRequests();
    }
  }, [user]);

  useEffect(() => {
    if (selectedCommunity && isMember) {
      loadMessages();
      subscribeToMessages();
    }
    return () => {
      if (messageUnsubscribeRef.current) {
        messageUnsubscribeRef.current();
      }
    };
  }, [selectedCommunity, isMember]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadCommunities = async () => {
    setLoading(true);
    const { data, error } = await getApprovedCommunities();
    if (error) {
      toast.error(error);
    } else {
      setCommunities(data || []);
    }
    setLoading(false);
  };

  const loadUserCommunities = async () => {
    const { data, error } = await getUserCommunities();
    if (!error && data) {
      setUserCommunities(data);
    }
  };

  const loadUserRequests = async () => {
    const { data, error } = await getUserCommunityRequests();
    if (!error && data) {
      setUserRequests(data);
      setHasPendingRequests(data.some(req => req.status === "pending"));
    }
  };

  const handleCreateRequest = async e => {
    e.preventDefault();
    if (!createForm.gameId || !createForm.name || !createForm.description) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    const { success, error } = await requestCommunityCreation(
      createForm.gameId,
      createForm.name,
      createForm.description,
      createForm.iconUrl
    );

    if (success) {
      toast.success(t("ascend.community.createRequest.success"));
      setCreateForm({ gameId: "", name: "", description: "", iconUrl: "" });
      await loadUserRequests();
      setShowSuccessMessage(true);
      setActiveView("browse");
      setTimeout(() => setShowSuccessMessage(false), 5000);
    } else {
      toast.error(error);
    }
    setLoading(false);
  };

  const handleSelectCommunity = async community => {
    setLoading(true);
    setSelectedCommunity(community);
    setActiveView("community");

    const membershipCheck = await checkCommunityMembership(community.id);
    setIsMember(membershipCheck.isMember);
    setIsOwner(membershipCheck.isOwner);

    if (membershipCheck.isMember) {
      const membersResult = await getCommunityMembers(community.id);
      if (membersResult.data) {
        setMembers(membersResult.data);
      }

      if (membershipCheck.isOwner) {
        const requestsResult = await getCommunityJoinRequests(community.id);
        if (requestsResult.data) {
          setJoinRequests(requestsResult.data);
        }
      }
    }

    setLoading(false);
  };

  const handleJoinCommunity = async () => {
    setLoading(true);
    const { success, error } = await requestJoinCommunity(selectedCommunity.id);
    if (success) {
      toast.success(t("ascend.community.joinRequest.pending"));
    } else {
      toast.error(error || t("ascend.community.joinRequest.error"));
    }
    setLoading(false);
  };

  const loadMessages = async () => {
    if (!selectedCommunity) return;
    const { data, error } = await getCommunityMessages(selectedCommunity.id);
    if (!error && data) {
      setMessages(data);
    }
  };

  const subscribeToMessages = () => {
    if (!selectedCommunity) return;
    if (messageUnsubscribeRef.current) {
      messageUnsubscribeRef.current();
    }
    messageUnsubscribeRef.current = subscribeToCommunityMessages(
      selectedCommunity.id,
      newMessages => {
        setMessages(newMessages);
      }
    );
  };

  const handleSendMessage = async e => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    const content = messageInput;
    setMessageInput("");

    const { success, error } = await sendCommunityMessage(selectedCommunity.id, content);

    if (error) {
      toast.error(error);
      setMessageInput(content);
    }
  };

  const handleApproveJoinRequest = async (requestId, userId) => {
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(
        "https://api.ascendara.app/community/owner/approve-join",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            requestId,
            communityId: selectedCommunity.id,
            userId,
            ownerId: user.uid,
          }),
        }
      );

      const result = await response.json();
      if (result.success) {
        toast.success(t("ascend.community.joinRequest.approved"));
        setJoinRequests(joinRequests.filter(r => r.id !== requestId));
        const membersResult = await getCommunityMembers(selectedCommunity.id);
        if (membersResult.data) {
          setMembers(membersResult.data);
        }
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(t("ascend.community.joinRequest.error"));
    }
  };

  const handleDenyJoinRequest = async requestId => {
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(
        "https://api.ascendara.app/community/owner/deny-join",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            requestId,
            communityId: selectedCommunity.id,
            ownerId: user.uid,
          }),
        }
      );

      const result = await response.json();
      if (result.success) {
        toast.success(t("ascend.community.joinRequest.denied"));
        setJoinRequests(joinRequests.filter(r => r.id !== requestId));
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(t("ascend.community.joinRequest.error"));
    }
  };

  const filteredCommunities = communities.filter(
    c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (activeView === "create") {
    const pendingRequest = userRequests.find(req => req.status === "pending");

    return (
      <div className="flex h-full flex-col p-6">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setActiveView("browse")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("ascend.community.back")}
          </Button>
        </div>

        {pendingRequest ? (
          <div className="mx-auto w-full max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-orange-500/10 p-8"
            >
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-yellow-500/10 blur-3xl" />
              <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-amber-500/10 blur-2xl" />

              <div className="relative">
                <div className="mb-6 flex items-start gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-500/20 backdrop-blur-sm">
                    <Clock className="h-8 w-8 text-yellow-500" />
                  </div>
                  <div className="flex-1">
                    <h2 className="mb-2 text-2xl font-bold">
                      {t("ascend.community.pending")}
                    </h2>
                    <p className="text-muted-foreground">
                      Your community request is currently being reviewed by our team.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-border/50 bg-background/50 p-6 backdrop-blur-sm">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Community Name
                    </Label>
                    <p className="mt-1 text-lg font-semibold">{pendingRequest.name}</p>
                  </div>

                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Description
                    </Label>
                    <p className="mt-1 text-sm">{pendingRequest.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Game ID
                      </Label>
                      <p className="mt-1 inline-block rounded bg-muted/50 px-2 py-1 font-mono text-sm">
                        {pendingRequest.gameId}
                      </p>
                    </div>

                    <div>
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Submitted
                      </Label>
                      <p className="mt-1 text-sm">
                        {pendingRequest.createdAt?.toDate?.()?.toLocaleDateString() ||
                          "Recently"}
                      </p>
                    </div>
                  </div>

                  {pendingRequest.iconUrl && (
                    <div>
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Icon URL
                      </Label>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {pendingRequest.iconUrl}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/20">
                    <Loader2 className="h-5 w-5 animate-spin text-yellow-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Awaiting Admin Review</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      You'll be notified once your request has been processed. Only one
                      pending request is allowed at a time.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {userRequests.filter(req => req.status !== "pending").length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-6"
              >
                <h3 className="mb-4 text-lg font-semibold">Previous Requests</h3>
                <div className="space-y-3">
                  {userRequests
                    .filter(req => req.status !== "pending")
                    .map(req => (
                      <div
                        key={req.id}
                        className="rounded-lg border bg-card/50 p-4 backdrop-blur-sm"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-medium">{req.name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {req.description}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {req.status === "approved" && (
                              <>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="text-sm font-medium text-green-500">
                                  {t("ascend.community.approved")}
                                </span>
                              </>
                            )}
                            {req.status === "denied" && (
                              <>
                                <XCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm font-medium text-red-500">
                                  {t("ascend.community.denied")}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {req.denialReason && (
                          <p className="mt-2 rounded border border-red-500/10 bg-red-500/5 p-2 text-xs text-red-500/80">
                            {req.denialReason}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-violet-500/10 p-8"
            >
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
              <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-violet-500/20 blur-2xl" />

              <div className="relative">
                <div className="mb-4 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 backdrop-blur-sm">
                    <Users className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">
                      {t("ascend.community.createRequest.title")}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Create a community for your favorite game
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              onSubmit={handleCreateRequest}
              className="space-y-6"
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Gamepad2 className="h-4 w-4 text-primary" />
                    {t("ascend.community.createRequest.gameId")} *
                  </Label>
                  <Input
                    value={createForm.gameId}
                    onChange={e =>
                      setCreateForm({ ...createForm, gameId: e.target.value })
                    }
                    placeholder="e.g., AFVBWf"
                    className="h-11"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("ascend.community.createRequest.gameIdHelp")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-primary" />
                    {t("ascend.community.createRequest.name")} *
                  </Label>
                  <Input
                    value={createForm.name}
                    onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="e.g., Forza Horizon 5 Drivers"
                    maxLength={50}
                    className="h-11"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {createForm.name.length}/50 characters
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  {t("ascend.community.createRequest.description")} *
                </Label>
                <Textarea
                  value={createForm.description}
                  onChange={e =>
                    setCreateForm({ ...createForm, description: e.target.value })
                  }
                  placeholder={t("ascend.community.createRequest.descriptionPlaceholder")}
                  maxLength={200}
                  rows={4}
                  className="resize-none"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {createForm.description.length}/200 characters
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t("ascend.community.createRequest.iconUrl")}
                </Label>
                <Input
                  value={createForm.iconUrl}
                  onChange={e =>
                    setCreateForm({ ...createForm, iconUrl: e.target.value })
                  }
                  placeholder={t("ascend.community.createRequest.iconUrlPlaceholder")}
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Provide a URL to an icon for your community
                </p>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={loading}
                  size="lg"
                  className="text-secondary"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("ascend.community.createRequest.submitting")}
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      {t("ascend.community.createRequest.submit")}
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Your request will be reviewed by our team
                </p>
              </div>
            </motion.form>

            {userRequests.filter(req => req.status !== "pending").length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-8"
              >
                <h3 className="mb-4 text-lg font-semibold">Previous Requests</h3>
                <div className="space-y-3">
                  {userRequests
                    .filter(req => req.status !== "pending")
                    .map(req => (
                      <div
                        key={req.id}
                        className="rounded-lg border bg-card/50 p-4 backdrop-blur-sm"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-medium">{req.name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {req.description}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {req.status === "approved" && (
                              <>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="text-sm font-medium text-green-500">
                                  {t("ascend.community.approved")}
                                </span>
                              </>
                            )}
                            {req.status === "denied" && (
                              <>
                                <XCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm font-medium text-red-500">
                                  {t("ascend.community.denied")}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {req.denialReason && (
                          <p className="mt-2 rounded border border-red-500/10 bg-red-500/5 p-2 text-xs text-red-500/80">
                            {req.denialReason}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (activeView === "community" && selectedCommunity) {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border bg-background">
        {/* Enhanced Header */}
        <div className="relative overflow-hidden border-b bg-gradient-to-r from-primary/10 via-violet-500/5 to-transparent backdrop-blur-sm">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-50" />
          <div className="relative flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveView("browse");
                  setSelectedCommunity(null);
                  if (messageUnsubscribeRef.current) {
                    messageUnsubscribeRef.current();
                  }
                }}
                className="hover:bg-primary/10"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("ascend.community.back")}
              </Button>
              <div className="h-8 w-px bg-border/50" />
              <div className="flex items-center gap-3">
                {selectedCommunity.iconUrl ? (
                  <img
                    src={selectedCommunity.iconUrl}
                    alt=""
                    className="h-10 w-10 rounded-xl object-cover ring-2 ring-primary/20"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 ring-2 ring-primary/20">
                    <Gamepad2 className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div>
                  <h2 className="text-base font-bold">{selectedCommunity.name}</h2>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {members.length} {t("ascend.community.members")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {!isMember ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md text-center"
            >
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/20">
                <Users className="h-10 w-10 text-primary" />
              </div>
              <h3 className="mb-3 text-2xl font-bold">
                {t("ascend.community.joinCommunity")}
              </h3>
              <p className="mb-8 leading-relaxed text-muted-foreground">
                {selectedCommunity.description}
              </p>
              <Button
                onClick={handleJoinCommunity}
                disabled={loading}
                size="lg"
                className="text-secondary"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("ascend.community.joinRequest.requesting")}
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t("ascend.community.joinRequest.title")}
                  </>
                )}
              </Button>
            </motion.div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Join Requests Sidebar (Owner Only) */}
            {isOwner && joinRequests.length > 0 && (
              <div className="flex w-64 flex-col border-r bg-gradient-to-b from-yellow-500/5 to-transparent">
                <div className="border-b bg-yellow-500/10 px-4 py-3 backdrop-blur-sm">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-yellow-600 dark:text-yellow-500">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-yellow-500/20">
                      <Clock className="h-3.5 w-3.5" />
                    </div>
                    {t("ascend.community.joinRequests")} ({joinRequests.length})
                  </h3>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  {joinRequests.map(req => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between rounded-xl border bg-card/50 p-3 text-sm transition-colors hover:bg-card"
                    >
                      <span className="truncate font-medium">{req.userName}</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 hover:bg-green-500/10 hover:text-green-500"
                          onClick={() => handleApproveJoinRequest(req.id, req.userId)}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 hover:bg-red-500/10 hover:text-red-500"
                          onClick={() => handleDenyJoinRequest(req.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Community Chat Area */}
            <div className="flex min-w-0 flex-1 flex-col bg-gradient-to-b from-transparent to-accent/5">
              {/* Messages Area */}
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/20">
                      <MessageCircle className="h-8 w-8 text-primary" />
                    </div>
                    <p className="mb-1 text-sm font-medium">No messages yet</p>
                    <p className="text-xs text-muted-foreground">
                      Start the conversation!
                    </p>
                  </div>
                ) : (
                  messages.map(msg => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group -mx-2 flex gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/30"
                    >
                      <div className="relative flex-shrink-0">
                        {msg.senderPhotoURL ? (
                          <img
                            src={msg.senderPhotoURL}
                            alt=""
                            className="h-10 w-10 rounded-full ring-2 ring-background"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20 ring-2 ring-background">
                            <Users className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-baseline gap-2">
                          <span className="text-sm font-semibold">{msg.senderName}</span>
                          <span className="text-xs text-muted-foreground">
                            {msg.createdAt?.toDate?.()?.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            }) || ""}
                          </span>
                        </div>
                        <p className="break-words text-sm leading-relaxed">
                          {msg.content}
                        </p>
                      </div>
                    </motion.div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form
                onSubmit={handleSendMessage}
                className="flex-shrink-0 border-t bg-card/50 p-4 backdrop-blur-sm"
              >
                <div className="flex gap-3">
                  <Input
                    value={messageInput}
                    onChange={e => setMessageInput(e.target.value)}
                    placeholder={`Message ${selectedCommunity.name}`}
                    maxLength={2000}
                    className="h-11 border-border/50 bg-background transition-colors focus:border-primary"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="h-11 w-11 shrink-0 bg-primary hover:bg-primary/90"
                    disabled={!messageInput.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </div>

            {/* Enhanced Members Sidebar */}
            <div className="flex w-56 flex-col border-l bg-gradient-to-b from-primary/5 to-transparent">
              <div className="border-b bg-card/50 px-4 py-3 backdrop-blur-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </div>
                  {t("ascend.community.members")} ({members.length})
                </h3>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto p-3">
                {members.map(member => (
                  <div
                    key={member.id}
                    className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50"
                  >
                    <div className="relative flex-shrink-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20 ring-2 ring-background">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      {member.role === "owner" && (
                        <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                      )}
                      {member.role === "moderator" && (
                        <Shield className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                      )}
                      <span className="truncate text-sm font-medium transition-colors group-hover:text-foreground">
                        {member.userName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-violet-500/10 p-6">
        <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("ascend.community.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect with other players in game-based communities
            </p>
          </div>
          <Button className="text-secondary" onClick={() => setActiveView("create")}>
            {hasPendingRequests ? (
              <>
                <Clock className="mr-2 h-4 w-4" />
                {t("ascend.community.requests.title")}
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                {t("ascend.community.requestCommunity")}
              </>
            )}
          </Button>
        </div>
      </div>

      {showSuccessMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/10 p-4"
        >
          <CheckCircle className="h-5 w-5 text-green-500" />
          <div className="flex-1">
            <p className="font-medium text-green-500">
              {t("ascend.community.createRequest.success")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("ascend.community.createRequest.successDescription")}
            </p>
          </div>
        </motion.div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t("ascend.community.search")}
          className="h-11 pl-10"
        />
      </div>

      {userCommunities.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-semibold">
            {t("ascend.community.yourCommunities")}
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {userCommunities.map(community => (
              <button
                key={community.id}
                onClick={() => handleSelectCommunity(community)}
                className="group rounded-xl border p-5 text-left transition-all hover:border-primary hover:bg-accent/50"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 transition-colors group-hover:from-primary/30 group-hover:to-violet-500/30">
                    <Gamepad2 className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate font-semibold">{community.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {community.memberCount} {t("ascend.community.members")}
                    </p>
                  </div>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {community.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-4 text-lg font-semibold">
          {t("ascend.community.allCommunities")}
        </h3>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredCommunities.length === 0 ? (
          <div className="rounded-xl border bg-card/30 py-16 text-center">
            <Users className="mx-auto mb-4 h-16 w-16 text-muted-foreground/50" />
            <p className="text-muted-foreground">{t("ascend.community.noCommunities")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCommunities.map(community => (
              <button
                key={community.id}
                onClick={() => handleSelectCommunity(community)}
                className="group rounded-xl border p-5 text-left transition-all hover:border-primary hover:bg-accent/50"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 transition-colors group-hover:from-primary/30 group-hover:to-violet-500/30">
                    <Gamepad2 className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate font-semibold">{community.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {community.memberCount} {t("ascend.community.members")}
                    </p>
                  </div>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {community.description}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunityHub;
