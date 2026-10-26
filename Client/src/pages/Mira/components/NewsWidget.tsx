import { type FC } from "react";
import {
  Newspaper,
  ExternalLink,
  RotateCw,
  Loader2,
  AlertCircle,
  Globe,
} from "lucide-react";
import type { NewsArticle } from "@/services/dailySuggestions.service";

interface NewsWidgetProps {
  news: NewsArticle[];
  previousNews: NewsArticle[];
  isRefreshing: boolean;
  onRefresh: () => void;
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
}) => {
  const hasCurrentData = Boolean(news && news.length > 0);
  const hasPreviousData = Boolean(previousNews && previousNews.length > 0);

  const activeNews = hasCurrentData ? news : (isRefreshing && hasPreviousData ? previousNews : []);
  const isDisplayingOutdated = !hasCurrentData && isRefreshing && hasPreviousData;

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
                3 Key Stories
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDisplayingOutdated && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Previous
            </span>
          )}
          {isRefreshing && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              Updating
            </span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh News Headlines"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/80 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      {activeNews.length === 0 ? (
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
        <div className="flex flex-col gap-3 flex-1">
          {activeNews.slice(0, 3).map((article, index) => {
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
      )}
    </div>
  );
};
