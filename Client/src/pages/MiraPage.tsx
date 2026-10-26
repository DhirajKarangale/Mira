import type { FC } from "react";
import { useNavigate } from "react-router-dom";
import { UserX, ArrowRight, RefreshCw } from "lucide-react";
import { useMiraData } from "./Mira/useMiraData";
import {
  WelcomeHeader,
  WeatherWidget,
  NewsWidget,
  DailySuggestionsWidget,
  MusicWidget,
  EntertainmentWidget,
} from "./Mira/components";

export const MiraPage: FC = () => {
  const navigate = useNavigate();
  const {
    userDetails,
    isUserLoading,
    today,
    previous,
    completedIndices,
    toggleSuggestionCompletion,
    refreshingSection,
    handleRefresh,
  } = useMiraData();

  const hasUserData = Boolean(
    userDetails?.user_name?.trim() ||
    userDetails?.city?.trim() ||
    userDetails?.country?.trim()
  );

  return (
    <div
      id="page-content-mira"
      className="relative flex flex-col h-full w-full overflow-y-auto mira-scrollbar p-4 sm:p-6 lg:p-7 gap-5 select-none"
    >
      {/* Background Ambient Glows */}
      <div className="absolute top-10 left-1/4 w-[500px] h-[300px] bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-1/4 w-[400px] h-[300px] bg-blue-500/5 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Optional Missing Profile Notice */}
      {!isUserLoading && !hasUserData && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 px-4 rounded-xl border border-amber-500/25 bg-amber-500/10 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="flex items-center gap-2.5 text-xs text-amber-200">
            <UserX className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Your profile is not yet configured. Set your city and country in the <strong>Me</strong> tab for accurate local weather and news.
            </span>
          </div>
          <button
            type="button"
            id="mira-go-to-me-tab-btn"
            onClick={() => navigate("/user")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-md shadow-amber-500/20 transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
          >
            <span>Configure Me Tab</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Unified Dashboard Grid: Left Column (Welcome, Suggestions, Coming Soon) | Right Column (Weather Card, News) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-start">
        {/* Left Column (approx 7 columns) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          <WelcomeHeader userName={userDetails?.user_name || undefined} />

          {/* Prominent Daily Suggestions */}
          <DailySuggestionsWidget
            suggestions={today.suggestions}
            previousSuggestions={previous.suggestions}
            completedIndices={completedIndices}
            onToggleComplete={toggleSuggestionCompletion}
            isRefreshing={Boolean(refreshingSection.suggestions)}
            onRefresh={() => handleRefresh("suggestions")}
          />

          {/* Music & Entertainment Containers (Side-by-side) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MusicWidget />
            <EntertainmentWidget />
          </div>
        </div>

        {/* Right Column: Top-Right Weather Card + News Stories Below It (approx 5 columns) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <WeatherWidget
            weather={today.weather}
            previousWeather={previous.weather}
            isRefreshing={Boolean(refreshingSection.weather)}
            onRefresh={() => handleRefresh("weather")}
          />

          <NewsWidget
            news={today.news}
            previousNews={previous.news}
            isRefreshing={Boolean(refreshingSection.news)}
            onRefresh={() => handleRefresh("news")}
          />
        </div>
      </div>

      {/* Subtle Bottom Refresh Status Bar */}
      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 px-1 border-t border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
          <span>Real-time WebSocket intelligence active</span>
        </div>
        <button
          type="button"
          onClick={() => handleRefresh("all")}
          className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Refresh All Sections</span>
        </button>
      </div>
    </div>
  );
};
