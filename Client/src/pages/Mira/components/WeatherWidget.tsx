import { type FC } from "react";
import {
  Cloud,
  Sun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Wind,
  Droplets,
  RotateCw,
  MapPin,
  Sparkles,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";
import type { WeatherData } from "@/services/dailySuggestions.service";

interface WeatherWidgetProps {
  weather: WeatherData | null;
  previousWeather: WeatherData | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

function getWeatherIcon(condition?: string, code?: number) {
  const cond = (condition || "").toLowerCase();
  if (cond.includes("thunder") || (code && code >= 95)) {
    return <CloudLightning className="w-6 h-6 text-amber-400" />;
  }
  if (cond.includes("snow") || (code && (code >= 71 && code <= 86))) {
    return <CloudSnow className="w-6 h-6 text-sky-200" />;
  }
  if (cond.includes("rain") || cond.includes("drizzle") || cond.includes("shower") || (code && code >= 51)) {
    return <CloudRain className="w-6 h-6 text-cyan-400" />;
  }
  if (cond.includes("cloud") || cond.includes("overcast") || cond.includes("fog")) {
    return <Cloud className="w-6 h-6 text-zinc-300" />;
  }
  return <Sun className="w-6 h-6 text-amber-400 animate-pulse" />;
}

export const WeatherWidget: FC<WeatherWidgetProps> = ({
  weather,
  previousWeather,
  isRefreshing,
  onRefresh,
}) => {
  const hasCurrentData = Boolean(weather && (weather.current || weather.suggestion));
  const hasPreviousData = Boolean(previousWeather && (previousWeather.current || previousWeather.suggestion));

  const activeWeather = hasCurrentData ? weather : (isRefreshing && hasPreviousData ? previousWeather : null);
  const isDisplayingOutdated = !hasCurrentData && isRefreshing && hasPreviousData;

  const cur = activeWeather?.current;
  const loc = activeWeather?.location;
  const daily = activeWeather?.daily || [];
  const todayForecast = daily[0];
  const hourly = activeWeather?.hourly || [];

  return (
    <div
      id="mira-weather-widget"
      className="relative flex flex-col justify-between p-4 rounded-2xl bg-zinc-900/40 border border-white/[0.08] backdrop-blur-xl shadow-lg transition-all duration-300 hover:border-cyan-500/20 group overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/15 transition-all duration-500" />

      {/* Top Header Row: Location Pill + Status Badges + Refresh */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/[0.06] mb-3 z-10">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate max-w-[190px]" title={loc?.name || "Local Forecast"}>
            {loc?.name || "Local Forecast"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
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
            title="Refresh Weather Forecast"
            className="p-1 rounded-lg text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/80 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      {!activeWeather ? (
        <div className="flex flex-col items-center justify-center py-6 text-center text-zinc-400 gap-2 z-10">
          {isRefreshing ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <p className="text-xs font-medium text-zinc-300">Fetching latest forecast...</p>
              <p className="text-[11px] text-zinc-500 max-w-[210px]">
                Checking satellite radar and atmospheric readings.
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="w-6 h-6 text-amber-400/80" />
              <p className="text-xs font-medium text-zinc-300">Weather data unavailable</p>
              <p className="text-[11px] text-zinc-500 max-w-[210px]">
                Set your city in Settings or click refresh to retrieve local conditions.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 z-10">
          {/* Temperature & Condition Row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-zinc-800/60 border border-white/[0.05] shadow-inner shrink-0">
                {getWeatherIcon(cur?.condition, cur?.weather_code)}
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono">
                    {cur?.temperature_celsius !== undefined ? Math.round(cur.temperature_celsius) : "--"}
                  </span>
                  <span className="text-xs font-medium text-zinc-400">°C</span>
                  {cur?.apparent_temperature_celsius !== undefined && (
                    <span className="text-[11px] text-zinc-400 ml-1.5 font-normal">
                      Feels {Math.round(cur.apparent_temperature_celsius)}°
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-zinc-300 capitalize truncate max-w-[160px]">
                  {cur?.condition || "Clear"}
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex flex-col items-end gap-1 text-[11px] text-zinc-400 font-mono shrink-0">
              {todayForecast?.temp_max_celsius !== undefined && (
                <div className="flex items-center gap-1 font-semibold">
                  <span className="text-red-400">↑{Math.round(todayForecast.temp_max_celsius)}°</span>
                  <span className="text-blue-400">↓{Math.round(todayForecast.temp_min_celsius || 0)}°</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-zinc-400 text-[10px]">
                {cur?.relative_humidity_percent !== undefined && (
                  <span className="flex items-center gap-0.5">
                    <Droplets className="w-3 h-3 text-cyan-400" />
                    {cur.relative_humidity_percent}%
                  </span>
                )}
                {cur?.wind_speed_kmh !== undefined && (
                  <span className="flex items-center gap-0.5">
                    <Wind className="w-3 h-3 text-teal-400" />
                    {Math.round(cur.wind_speed_kmh)} km/h
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Version 1: Short Summary / Forecast Overview */}
          {(activeWeather.short_summary || activeWeather.rest_of_day) && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-xs text-cyan-200">
              <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                  Forecast Overview
                </span>
                <p className="text-[11px] sm:text-xs leading-relaxed text-zinc-200 font-medium">
                  {activeWeather.short_summary || activeWeather.rest_of_day}
                </p>
              </div>
            </div>
          )}

          {/* Mini Hourly Forecast Ribbon (If available) */}
          {hourly.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto py-1 px-0.5 no-scrollbar">
              {hourly.slice(0, 4).map((h, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center justify-center p-1.5 px-2.5 rounded-lg bg-zinc-800/40 border border-white/[0.04] text-[10px] shrink-0"
                >
                  <span className="text-zinc-400 font-mono text-[9px]">{h.formatted_time?.replace(":00 ", " ")}</span>
                  <span className="font-semibold text-zinc-200 font-mono mt-0.5">
                    {h.temperature_celsius !== undefined ? Math.round(h.temperature_celsius) : "--"}°
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Version 2: Playful / Funny Descriptive Weather Recommendation */}
          {(activeWeather.funny_suggestion || activeWeather.suggestion) && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-zinc-800/50 border border-amber-500/20 text-xs text-zinc-300 leading-relaxed shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                  MIRA's Weather Note
                </span>
                <p className="text-[11px] sm:text-xs text-zinc-200 font-sans leading-relaxed">
                  {activeWeather.funny_suggestion || activeWeather.suggestion}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
