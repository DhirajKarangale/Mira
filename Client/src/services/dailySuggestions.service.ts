import { engineApi } from "@/lib/api";

export interface WeatherCurrent {
  time?: string;
  temperature_celsius?: number;
  apparent_temperature_celsius?: number;
  relative_humidity_percent?: number;
  wind_speed_kmh?: number;
  precipitation_mm?: number;
  rain_mm?: number;
  snowfall_cm?: number;
  condition?: string;
  weather_code?: number;
}

export interface WeatherDayForecast {
  date: string;
  day: string;
  condition: string;
  temp_max_celsius?: number;
  temp_min_celsius?: number;
  apparent_temp_max_celsius?: number;
  apparent_temp_min_celsius?: number;
  precipitation_probability_percent?: number;
  rain_sum_mm?: number;
  wind_speed_max_kmh?: number;
}

export interface WeatherHourlyForecast {
  time: string;
  formatted_time: string;
  temperature_celsius?: number;
  apparent_temperature_celsius?: number;
  condition?: string;
  precipitation_probability_percent?: number;
  rain_mm?: number;
  wind_speed_kmh?: number;
}

export interface WeatherData {
  status?: string;
  location?: {
    name?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
  };
  current?: WeatherCurrent;
  daily?: WeatherDayForecast[];
  hourly?: WeatherHourlyForecast[];
  short_summary?: string;
  rest_of_day?: string;
  funny_suggestion?: string;
  suggestion?: string;
  has_advisory?: boolean;
  advisory_type?: string;
  summary_text?: string;
  message?: string;
  updated_at?: string;
}

export interface NewsArticle {
  title: string;
  summary: string;
  url: string;
  source: string;
  published_at?: string;
}

export interface DailySuggestionsRecord {
  id: number | null;
  date_suggestions?: string | null;
  suggestions: string[];
  completed: number[];
  date_weather?: string | null;
  weather: WeatherData | null;
  date_news?: string | null;
  news: NewsArticle[];
  date_music?: string | null;
  music?: unknown[];
  date_entertainment?: string | null;
  entertainment?: unknown[];
}

export interface DailySuggestionsPageResponse {
  status: string;
  has_llm_keys?: boolean;
  has_gnews_keys?: boolean;
  today: DailySuggestionsRecord;
  previous: DailySuggestionsRecord;
  scheduler: {
    running: boolean;
    weather?: { status: string; interval_hours: number; last_run?: string; next_run?: string };
    news?: { status: string; interval_hours: number; last_run?: string; next_run?: string };
    suggestions?: { status: string; interval_hours: number; last_run?: string; next_run?: string };
  };
}

export const dailySuggestionsService = {
  async getPageData(): Promise<DailySuggestionsPageResponse> {
    const response = await engineApi.get<DailySuggestionsPageResponse>("/daily_suggestions");
    return response.data;
  },

  async triggerRefresh(section: string = "all"): Promise<any> {
    const response = await engineApi.post("/daily_suggestions/refresh", { section });
    return response.data;
  },

  async completeSuggestion(
    index: number,
    completed: boolean,
    recordId?: number | null
  ): Promise<{ status: string; completed: number[]; record_id?: number }> {
    const response = await engineApi.post<{ status: string; completed: number[]; record_id?: number }>(
      "/daily_suggestions/complete",
      {
        index,
        completed,
        record_id: recordId,
      }
    );
    return response.data;
  },
};
