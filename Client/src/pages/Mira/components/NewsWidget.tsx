import { useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import {
  Newspaper,
  ExternalLink,
  RotateCw,
  Loader2,
  AlertCircle,
  Globe,
  ArrowRight,
  KeyRound,
  ChevronDown,
} from "lucide-react";
import type { NewsArticle } from "@/services/dailySuggestions.service";

interface NewsWidgetProps {
  news: NewsArticle[];
  previousNews: NewsArticle[];
  isRefreshing: boolean;
  onRefresh: () => void;
  isLocationConfigured?: boolean;
  isUserLoading?: boolean;
  hasGnewsKeys?: boolean;
}

function formatRelativeTime(dateStr?: string) {
  if (!dateStr) return "";
  try {
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return dateStr;
    const diffMs = Date.now() - dt.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours <= 0) return "Just now";
    if (diffHours === 1) return "1 hr ago";
    if (diffHours < 24) return `${diffHours} hrs ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return dateStr;
  }
}

export const NewsWidget: FC<NewsWidgetProps> = ({
  news,
  previousNews,
  isRefreshing,
  onRefresh,
  isLocationConfigured = true,
  isUserLoading = false,
  hasGnewsKeys = true,
}) => {
  const navigate = useNavigate();
  const [showAllNews, setShowAllNews] = useState(false);

  const hasCurrentData = Boolean(isLocationConfigured && news && news.length > 0);
  const hasPreviousData = Boolean(isLocationConfigured && previousNews && previousNews.length > 0);

  const activeNews = hasCurrentData ? news : (isRefreshing && hasPreviousData ? previousNews : []);
  const isDisplayingOutdated = !hasCurrentData && isRefreshing && hasPreviousData;
  const displayedNews = showAllNews ? activeNews : activeNews.slice(0, 3);

  return (
    <div
      id="mira-news-widget"
      className="flex flex-col h-full p-4 rounded-2xl bg-zinc-900/40 border border-white/[0.08] backdrop-blur-xl shadow-lg transition-all duration-300 hover:border-cyan-500/20"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.06] mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Newspaper className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <span>Top Headlines</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 font-normal">
                {!hasGnewsKeys
                  ? "Key Required"
                  : isLocationConfigured
                  ? activeNews.length > 0
                    ? `${activeNews.length} Stor${activeNews.length === 1 ? "y" : "ies"}`
                    : "Top Headlines"
                  : "Location Required"}
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!hasGnewsKeys && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <KeyRound className="w-3 h-3 text-amber-400" />
              <span>GNews Key Required</span>
            </span>
          )}
          {hasGnewsKeys && !isLocationConfigured && !isUserLoading && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Location Required
            </span>
          )}
          {hasGnewsKeys && isLocationConfigured && isDisplayingOutdated && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Previous
            </span>
          )}
          {hasGnewsKeys && isLocationConfigured && isRefreshing && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              Updating
            </span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing || !isLocationConfigured || !hasGnewsKeys}
            title={
              !hasGnewsKeys
                ? "GNews API key required to fetch news"
                : !isLocationConfigured
                ? "Configure location in Me tab to enable news"
                : "Refresh News Headlines"
            }
            className="p-1.5 rounded-lg text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/80 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing && isLocationConfigured && hasGnewsKeys ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      {!hasGnewsKeys ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 text-center text-zinc-400 gap-3 animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.15)]">
            <KeyRound className="w-6 h-6 text-amber-400" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-zinc-200">GNews API Key Required</p>
            <p className="text-xs text-zinc-400 max-w-[260px] leading-relaxed">
              You don't have a GNews API key configured. MIRA cannot fetch top headlines without a GNews key. Please add your GNews API key first.
            </p>
          </div>
          <button
            type="button"
            id="news-widget-add-key-btn"
            onClick={() => navigate("/tools/news")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-md shadow-amber-500/20 transition-all duration-200 active:scale-95 cursor-pointer mt-1"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Configure GNews Key in Tools Tab</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : isUserLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-zinc-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          <p className="text-xs text-zinc-400">Loading user profile...</p>
        </div>
      ) : !isLocationConfigured ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 text-center text-zinc-400 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.1)]">
            <Globe className="w-6 h-6 text-cyan-400" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-zinc-200">Location Not Configured</p>
            <p className="text-xs text-zinc-400 max-w-[240px] leading-relaxed">
              Top national headlines and regional news will appear once your location is configured. Please set your <strong className="font-bold">location</strong> in the <strong className="font-bold">Me</strong> tab.
            </p>
          </div>
          <button
            type="button"
            id="news-widget-set-location-btn"
            onClick={() => navigate("/user")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20 transition-all duration-200 active:scale-95 cursor-pointer mt-1"
          >
            <span>Set Location in Me Tab</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : activeNews.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-zinc-400 gap-2">
          {isRefreshing ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <p className="text-xs font-medium text-zinc-300">Selecting important headlines...</p>
              <p className="text-[11px] text-zinc-500 max-w-xs">
                Reviewing global and local stories for accuracy and relevance.
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="w-6 h-6 text-zinc-500" />
              <p className="text-xs font-medium text-zinc-300">No news articles available</p>
              <p className="text-[11px] text-zinc-500 max-w-xs">
                Check GNews configuration in Tools tab or click refresh to retrieve stories.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto mira-scrollbar pr-1">
            {displayedNews.map((article, index) => {
              const timeAgo = formatRelativeTime(article.published_at);
              return (
                <article
                  key={article.url || index}
                  className="group relative flex flex-col justify-between p-3.5 rounded-xl bg-zinc-800/30 border border-white/[0.05] hover:border-cyan-500/30 hover:bg-zinc-800/60 transition-all duration-200"
                >
                  <div>
                    {/* Source and Time Tag */}
                    <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px]">
                      <div className="flex items-center gap-1.5 text-cyan-400 font-medium">
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[150px]">{article.source || "News Source"}</span>
                      </div>
                      {timeAgo && (
                        <span className="text-zinc-500 font-mono text-[10px] shrink-0">{timeAgo}</span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-xs sm:text-sm font-semibold text-zinc-200 group-hover:text-cyan-300 transition-colors line-clamp-2 leading-snug">
                      {article.title}
                    </h3>

                    {/* Summary */}
                    {article.summary && (
                      <p className="text-xs text-zinc-400 mt-1.5 line-clamp-3 leading-relaxed">
                        {article.summary}
                      </p>
                    )}
                  </div>

                  {/* Clickable Source Link */}
                  {article.url && (
                    <div className="mt-2.5 pt-2 border-t border-white/[0.04] flex items-center justify-end">
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors group-hover:underline"
                      >
                        <span>Read article</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* Toggle More Stories Button */}
          {activeNews.length > 3 && (
            <button
              type="button"
              id="btn-toggle-show-all-news"
              onClick={() => setShowAllNews((prev) => !prev)}
              className="w-full mt-1 py-2 px-3 rounded-xl text-xs font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/15 border border-cyan-500/20 hover:border-cyan-500/30 transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.99]"
            >
              <span>
                {showAllNews
                  ? "Show fewer headlines"
                  : `View all ${activeNews.length} headlines (+${activeNews.length - 3} more)`}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAllNews ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

