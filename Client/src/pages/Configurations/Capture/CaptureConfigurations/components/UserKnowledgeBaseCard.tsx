import { useState, useMemo, type FC } from "react";
import {
  BrainCircuit,
  Trash2,
  RefreshCw,
  Search,
  FilterX,
  Sparkles,
  Lock,
  Music,
  Tv,
  Trophy,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  ShieldCheck,
  Tag,
  Heart,
} from "lucide-react";
import {
  useUserKnowledgeBaseQuery,
  useDeleteUserKnowledgeBaseMutation,
  useDeleteUserKnowledgeBaseRecordMutation,
} from "../../queries";
import { DeleteUserKnowledgeBaseModal } from "./DeleteUserKnowledgeBaseModal";
import { toast } from "@/components";
import { cn } from "@/lib/utils";

type CategoryFilter = "all" | "likes" | "dislikes" | "music" | "viewing" | "sports";

interface FlattenedKnowledgeItem {
  id: number;
  domain: "likes" | "dislikes" | "music" | "viewing" | "sports";
  category: string;
  title: string;
  subtitle?: string;
  details?: string;
  status: string;
  confidence: string;
  observationCount: number;
  lastObserved: string;
}

export const UserKnowledgeBaseCard: FC = () => {
  const [search, setSearch] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);

  const {
    data: ukbData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useUserKnowledgeBaseQuery();

  const deleteKbMutation = useDeleteUserKnowledgeBaseMutation();
  const deleteRecordMutation = useDeleteUserKnowledgeBaseRecordMutation();

  const userIdentity = ukbData?.user_identity;
  const stats = ukbData?.stats;

  // Flatten all personal knowledge items (likings, hateings, music, viewing, sports)
  // Strictly excludes routine desktop activities.
  const allItems: FlattenedKnowledgeItem[] = useMemo(() => {
    if (!ukbData) return [];
    const items: FlattenedKnowledgeItem[] = [];

    // 1. Preferences split cleanly into Likings vs Hateings / Dislikes
    (ukbData.preferences || []).forEach((p) => {
      const isDislike = (p.preference_type || "").toLowerCase() === "dislike";
      items.push({
        id: p.id,
        domain: isDislike ? "dislikes" : "likes",
        category: p.category || "General",
        title: p.item,
        subtitle: isDislike ? "Hate / Dislike" : "Liking / Preference",
        details: p.details,
        status: p.status,
        confidence: p.confidence,
        observationCount: p.observation_count || 1,
        lastObserved: p.last_observed,
      });
    });

    // 2. Music Tastes
    (ukbData.music_preferences || []).forEach((m) => {
      items.push({
        id: m.id,
        domain: "music",
        category: m.genre || "Music",
        title: m.artist || m.track || "Music Track",
        subtitle: m.platform ? `Platform: ${m.platform}` : (m.track ? `Track: ${m.track}` : undefined),
        details: m.details,
        status: m.status,
        confidence: m.confidence,
        observationCount: m.observation_count || 1,
        lastObserved: m.last_observed,
      });
    });

    // 3. Viewing Interests
    (ukbData.viewing_interests || []).forEach((v) => {
      items.push({
        id: v.id,
        domain: "viewing",
        category: v.media_type || "Media",
        title: v.title,
        subtitle: v.platform ? `Platform: ${v.platform}` : undefined,
        details: v.details,
        status: v.status,
        confidence: v.confidence,
        observationCount: v.observation_count || 1,
        lastObserved: v.last_observed,
      });
    });

    // 4. Sports Interests
    (ukbData.sports_interests || []).forEach((s) => {
      items.push({
        id: s.id,
        domain: "sports",
        category: s.sport_name || "Sports",
        title: s.teams_or_players || s.sport_name,
        subtitle: s.interest_level ? `Interest: ${s.interest_level}` : undefined,
        details: s.details,
        status: s.status,
        confidence: s.confidence,
        observationCount: s.observation_count || 1,
        lastObserved: s.last_observed,
      });
    });

    return items;
  }, [ukbData]);

  const totalItemsCount = allItems.length;

  const likesCount = useMemo(
    () => allItems.filter((i) => i.domain === "likes").length,
    [allItems]
  );
  const dislikesCount = useMemo(
    () => allItems.filter((i) => i.domain === "dislikes").length,
    [allItems]
  );
  const musicCount = useMemo(
    () => allItems.filter((i) => i.domain === "music").length,
    [allItems]
  );
  const viewingCount = useMemo(
    () => allItems.filter((i) => i.domain === "viewing").length,
    [allItems]
  );
  const sportsCount = useMemo(
    () => allItems.filter((i) => i.domain === "sports").length,
    [allItems]
  );

  // Filter items by category tab and search query
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (activeCategory !== "all" && item.domain !== activeCategory) {
        return false;
      }
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesCategory = item.category.toLowerCase().includes(query);
        const matchesDetails = (item.details || "").toLowerCase().includes(query);
        const matchesSubtitle = (item.subtitle || "").toLowerCase().includes(query);
        if (!matchesTitle && !matchesCategory && !matchesDetails && !matchesSubtitle) {
          return false;
        }
      }
      return true;
    });
  }, [allItems, activeCategory, search]);

  const handleExecuteDeleteAll = async () => {
    try {
      await deleteKbMutation.mutateAsync(false);
      toast.success(
        "User Knowledge Base personal data has been wiped and reset.",
        { title: "User Knowledge Base Reset" }
      );
      setIsDeleteModalOpen(false);
      refetch();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to delete User Knowledge Base data.";
      toast.error(msg, { title: "Deletion Error" });
    }
  };

  const handleDeleteRecord = async (domain: FlattenedKnowledgeItem["domain"], id: number) => {
    const backendCategory = (domain === "likes" || domain === "dislikes") ? "preferences" : domain;
    const key = `${domain}-${id}`;
    setDeletingRecordId(key);
    try {
      await deleteRecordMutation.mutateAsync({ category: backendCategory, id });
      toast.success("Knowledge item removed from User Knowledge Base.", {
        title: "Record Deleted",
      });
      refetch();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || "Failed to delete record.";
      toast.error(msg, { title: "Error" });
    } finally {
      setDeletingRecordId(null);
    }
  };

  const getDomainBadge = (domain: FlattenedKnowledgeItem["domain"]) => {
    switch (domain) {
      case "likes":
        return {
          icon: ThumbsUp,
          label: "Liking",
          color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
        };
      case "dislikes":
        return {
          icon: ThumbsDown,
          label: "Hate / Dislike",
          color: "bg-rose-500/10 text-rose-300 border-rose-500/20",
        };
      case "music":
        return {
          icon: Music,
          label: "Music",
          color: "bg-violet-500/10 text-violet-300 border-violet-500/20",
        };
      case "viewing":
        return {
          icon: Tv,
          label: "Viewing",
          color: "bg-amber-500/10 text-amber-300 border-amber-500/20",
        };
      case "sports":
        return {
          icon: Trophy,
          label: "Sports",
          color: "bg-sky-500/10 text-sky-300 border-sky-500/20",
        };
      default:
        return {
          icon: Tag,
          label: "Item",
          color: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
        };
    }
  };

  return (
    <div
      id="card-user-knowledge-base"
      className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-6"
    >
      <div className="absolute top-0 right-10 w-80 h-80 bg-purple-500/5 rounded-full blur-[90px] pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3.5">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-purple-500/10 border border-purple-500/25 text-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.15)]">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-white tracking-tight">
                User Knowledge Base
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                <Sparkles className="w-3 h-3" />
                <span>{totalItemsCount} {totalItemsCount === 1 ? "Fact Recorded" : "Facts Recorded"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                <Lock className="w-3 h-3" />
                <span>XChaCha20-Poly1305</span>
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Stores distilled personal identity, likings, and hateings (dislikes, hates, avoided tools). Routine desktop activities are tracked separately in the Activity Knowledge Base.
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            id="btn-refresh-user-kb"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh User Knowledge Base"
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-white/[0.08] transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin text-purple-400")} />
          </button>

          <button
            type="button"
            id="btn-delete-user-kb"
            onClick={() => setIsDeleteModalOpen(true)}
            disabled={totalItemsCount === 0 || deleteKbMutation.isPending}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/25 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete User Data</span>
          </button>
        </div>
      </div>

      {/* User Identity Snapshot Bar */}
      {userIdentity && (userIdentity.user_name || userIdentity.email) && (
        <div className="p-3.5 rounded-2xl bg-zinc-950/40 border border-white/[0.06] flex items-center justify-between gap-4 flex-wrap text-xs">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-300 font-bold font-mono text-xs">
              {(userIdentity.user_name || "U").charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="font-semibold text-zinc-200">{userIdentity.user_name || "User"}</span>
              {userIdentity.email && (
                <span className="text-zinc-500 ml-2 font-mono text-[11px]">{userIdentity.email}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-zinc-400 font-mono">
            {[userIdentity.city, userIdentity.state, userIdentity.country].filter(Boolean).length > 0 && (
              <span>Location: {[userIdentity.city, userIdentity.state, userIdentity.country].filter(Boolean).join(", ")}</span>
            )}
            <span className="hidden md:inline">•</span>
            <span className="text-zinc-500">Synced from Vault</span>
          </div>
        </div>
      )}

      {/* Search and Category Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-950/60 border border-white/[0.06] overflow-x-auto [scrollbar-width:none]">
          {(
            [
              { key: "all", label: "All", count: totalItemsCount, icon: null },
              { key: "likes", label: "Likings", count: likesCount, icon: ThumbsUp },
              { key: "dislikes", label: "Hateings", count: dislikesCount, icon: ThumbsDown },
              { key: "music", label: "Music", count: musicCount, icon: Music },
              { key: "viewing", label: "Viewing", count: viewingCount, icon: Tv },
              { key: "sports", label: "Sports", count: sportsCount, icon: Trophy },
            ] as const
          ).map((tab) => {
            const isActive = activeCategory === tab.key;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveCategory(tab.key)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                  isActive
                    ? "bg-purple-600 text-white font-semibold shadow-sm shadow-purple-950/60"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                )}
              >
                {TabIcon && <TabIcon className="w-3 h-3 shrink-0" />}
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0.2 rounded-full",
                    isActive ? "bg-purple-800 text-purple-200" : "bg-white/[0.06] text-zinc-500"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            id="input-user-kb-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search likings, hateings, tastes..."
            className="w-full pl-8.5 pr-8 py-1.5 rounded-xl bg-zinc-950/60 border border-white/[0.08] text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 transition-all font-mono"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer p-0.5"
            >
              <FilterX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content Section */}
      {isLoading ? (
        <div className="py-16 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400 mx-auto" />
          <p className="text-xs text-zinc-400 font-mono">Loading encrypted User Knowledge Base...</p>
        </div>
      ) : isError ? (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center space-y-2">
          <p className="text-xs font-semibold text-rose-300">
            Failed to load User Knowledge Base
          </p>
          <p className="text-[11px] text-zinc-400">
            {(error as Error)?.message || "Engine service may be offline or initializing."}
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-14 text-center rounded-2xl bg-zinc-950/30 border border-dashed border-white/[0.06] space-y-2.5">
          <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-zinc-500 mx-auto">
            <Heart className="w-5 h-5 text-purple-400/60" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-300">
              {search || activeCategory !== "all"
                ? "No matching knowledge items found"
                : "No personal likings or hateings recorded yet"}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5 max-w-md mx-auto">
              {search
                ? "Try clearing your search query or selecting a different filter tab."
                : "As you express your preferences, MIRA's background workers extract your likes, dislikes, favorite tools, and personal tastes cleanly."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(168,85,247,0.3)_transparent]">
          {filteredItems.map((item) => {
            const badge = getDomainBadge(item.domain);
            const BadgeIcon = badge.icon;
            const isDeletingThis = deletingRecordId === `${item.domain}-${item.id}`;

            return (
              <div
                key={`${item.domain}-${item.id}`}
                className="group p-4 rounded-2xl bg-zinc-950/50 border border-white/[0.06] hover:border-purple-500/30 transition-all space-y-2.5 relative"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border",
                        badge.color
                      )}
                    >
                      <BadgeIcon className="w-3 h-3 shrink-0" />
                      <span>{badge.label}</span>
                    </span>

                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                      {item.category}
                    </span>

                    {item.confidence === "explicit_fact" && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        Fact
                      </span>
                    )}

                    {item.observationCount > 1 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono text-zinc-500 bg-white/[0.03]">
                        {item.observationCount}x
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    title="Delete this knowledge item"
                    onClick={() => handleDeleteRecord(item.domain, item.id)}
                    disabled={isDeletingThis}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-all cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {isDeletingThis ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-white tracking-tight leading-snug">
                    {item.title}
                  </h4>
                  {item.subtitle && (
                    <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{item.subtitle}</p>
                  )}
                  {item.details && (
                    <p className="text-[11px] text-zinc-400 leading-relaxed mt-1 font-normal">
                      {item.details}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1 border-t border-white/[0.04]">
                  <span className="capitalize text-zinc-400">
                    Status: <strong className="text-zinc-300">{item.status}</strong>
                  </span>
                  <span>{new Date(item.lastObserved).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-between text-xs text-zinc-500 font-mono pt-2 border-t border-white/[0.06] flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
          <span>Local SQLite In-Memory • WAL Encrypted Serialization</span>
        </div>
        {stats?.last_updated && (
          <span>Updated: {new Date(stats.last_updated).toLocaleTimeString()}</span>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteUserKnowledgeBaseModal
        isOpen={isDeleteModalOpen}
        itemCount={totalItemsCount}
        onConfirmDelete={handleExecuteDeleteAll}
        onClose={() => setIsDeleteModalOpen(false)}
        isDeleting={deleteKbMutation.isPending}
      />
    </div>
  );
};
