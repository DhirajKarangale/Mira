import type { FC } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, User, UserX, ArrowRight, RefreshCw } from "lucide-react";
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
    isLocationConfigured,
    hasLlmKeys,
    hasGnewsKeys,
    today,
    previous,
    completedIndices,
    toggleSuggestionCompletion,
    refreshingSection,
    handleRefresh,
    isPageLoading,
  } = useMiraData();

  const hasUsername = Boolean(userDetails?.user_name?.trim());

  return (
    <div
      id="page-content-mira"
      className="relative flex flex-col h-full w-full overflow-y-auto mira-scrollbar p-3.5 sm:p-5 lg:p-7 gap-4 sm:gap-5 select-none"
    >
      {/* Background Ambient Glows */}
      <div className="absolute top-10 left-1/4 w-[500px] h-[300px] bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-1/4 w-[400px] h-[300px] bg-blue-500/5 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Missing Profile / Location Configuration Notice */}
      {!isUserLoading && (!isLocationConfigured || !hasUsername) && (
        <div
          id="mira-location-not-configured-banner"
          className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 px-4 rounded-xl border border-amber-500/25 bg-amber-500/10 backdrop-blur-xl animate-in fade-in duration-300 shadow-md shadow-amber-500/5"
        >
          <div className="flex items-center gap-2.5 text-xs text-amber-200">
            {!hasUsername && !isLocationConfigured ? (
              <UserX className="w-4 h-4 text-amber-400 shrink-0" />
            ) : !isLocationConfigured ? (
              <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <User className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>
              {!hasUsername && !isLocationConfigured ? (
                <>
                  Your <strong className="font-bold">username</strong> and <strong className="font-bold">location</strong> are not configured. Please set your details in the <strong className="font-bold">Me</strong> tab to personalize your daily greetings, local weather, and news.
                </>
              ) : !isLocationConfigured ? (
                <>
                  Your <strong className="font-bold">location</strong> is not configured. Please set your location in the <strong className="font-bold">Me</strong> tab to view local weather and personalized regional news.
                </>
              ) : (
                <>
                  Your <strong className="font-bold">username</strong> is not configured. Please set your username in the <strong className="font-bold">Me</strong> tab to personalize your daily greetings and AI recommendations.
                </>
              )}
            </span>
          </div>
          <button
            type="button"
            id="mira-go-to-me-tab-btn"
            onClick={() => navigate("/user")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-md shadow-amber-500/20 transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
          >
            <span>
              {!hasUsername && !isLocationConfigured
                ? "Configure Me Tab"
                : !isLocationConfigured
                ? "Set Location in Me Tab"
                : "Set Username in Me Tab"}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Unified Dynamic Dashboard Grid:
          Mobile Layout (single column flex):
            1. Welcome Message (WelcomeHeader)
            2. Weather Forecast (WeatherWidget)
            3. Daily Suggestions (DailySuggestionsWidget)
            4. Top Headlines & News (NewsWidget)
            5. Music & Entertainment (MusicWidget & EntertainmentWidget)
          Desktop Layout (12-column grid):
            Left Column (7 cols): WelcomeHeader -> DailySuggestions -> Music & Entertainment
            Right Column (5 cols): WeatherWidget -> NewsWidget
      */}
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 sm:gap-5 flex-1 items-stretch">
        {/* Left Column on Desktop (col-span-7); CSS contents on mobile so children participate directly in flex ordering */}
        <div className="contents lg:flex lg:flex-col lg:col-span-7 lg:gap-5 lg:justify-between">
          <div className="contents lg:flex lg:flex-col lg:gap-5 lg:flex-1">
            {/* 1. Name Welcome Header (Mobile Order 1) */}
            <div className="order-1">
              <WelcomeHeader userName={userDetails?.user_name || undefined} />
            </div>

            {/* 3. Daily Suggestions (Mobile Order 3) */}
            <div className="order-3 flex-1 flex flex-col min-h-0">
              <DailySuggestionsWidget
                suggestions={today.suggestions}
                previousSuggestions={previous.suggestions}
                completedIndices={completedIndices}
                onToggleComplete={toggleSuggestionCompletion}
                isRefreshing={Boolean(refreshingSection.suggestions)}
                isLoading={isPageLoading}
                onRefresh={() => handleRefresh("suggestions")}
                hasLlmKeys={hasLlmKeys}
              />
            </div>
          </div>

          {/* 5. Music & Entertainment Containers (Mobile Order 5, Desktop anchored at bottom) */}
          <div className="order-5 lg:mt-auto pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MusicWidget />
              <EntertainmentWidget />
            </div>
          </div>
        </div>

        {/* Right Column on Desktop (col-span-5); CSS contents on mobile so children participate directly in flex ordering */}
        <div className="contents lg:flex lg:flex-col lg:col-span-5 lg:gap-5 lg:justify-between">
          {/* 2. Weather Forecast (Mobile Order 2) */}
          <div className="order-2">
            <WeatherWidget
              weather={today.weather}
              previousWeather={previous.weather}
              isRefreshing={Boolean(refreshingSection.weather)}
              onRefresh={() => handleRefresh("weather")}
              isLocationConfigured={isLocationConfigured}
              isUserLoading={isUserLoading}
            />
          </div>

          {/* 4. Top Headlines & News (Mobile Order 4) */}
          <div className="order-4 flex-1 flex flex-col min-h-0">
            <NewsWidget
              news={today.news}
              previousNews={previous.news}
              isRefreshing={Boolean(refreshingSection.news)}
              onRefresh={() => handleRefresh("news")}
              isLocationConfigured={isLocationConfigured}
              isUserLoading={isUserLoading}
              hasGnewsKeys={hasGnewsKeys}
            />
          </div>
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
