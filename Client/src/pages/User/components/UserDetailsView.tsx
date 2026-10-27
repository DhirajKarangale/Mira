import type { FC } from "react";
import {
  User,
  Mail,
  Phone,
  Building2,
  MapPin,
  Globe,
  Edit3,
  PlusCircle,
  ShieldCheck,
  CheckCircle,
  Copy,
  Navigation,
  Compass,
  Hash,
} from "lucide-react";
import { useState } from "react";
import type { UserDetails } from "../types";
import { formatCoordinates } from "@/services";

interface UserDetailsViewProps {
  details: UserDetails | null;
  onEdit: () => void;
  onAdd: () => void;
}

export const UserDetailsView: FC<UserDetailsViewProps> = ({
  details,
  onEdit,
  onAdd,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string | null | undefined, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const hasData =
    Boolean(details) &&
    Boolean(
      details?.user_name?.trim() ||
      details?.email?.trim() ||
      details?.phone_number?.trim() ||
      details?.city?.trim() ||
      details?.state?.trim() ||
      details?.country?.trim() ||
      details?.address?.trim() ||
      details?.latitude != null ||
      details?.longitude != null
    );

  if (!hasData) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-8 sm:p-12 text-center backdrop-blur-xl shadow-xl flex flex-col items-center justify-center">
        <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
          <User className="w-10 h-10" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
          User data not found
        </h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
          User data not found enter your details in Me tab.
        </p>
        <button
          type="button"
          id="btn-add-user-details-empty"
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 transition-all duration-200 active:scale-95 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Enter Details</span>
        </button>
      </div>
    );
  }

  const initials =
    details?.user_name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join("") || "U";

  const coordinatesDisplay = formatCoordinates(details?.latitude, details?.longitude);
  const hasCoordinates =
    details?.latitude != null &&
    details?.longitude != null &&
    !Number.isNaN(details.latitude) &&
    !Number.isNaN(details.longitude);

  return (
    <div className="space-y-6">
      {/* Profile Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-4 sm:p-6 lg:p-8 backdrop-blur-xl shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 sm:gap-6">
          <div className="flex items-center gap-4 sm:gap-5 min-w-0">
            <div className="relative flex items-center justify-center w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white font-bold text-xl sm:text-2xl shadow-xl shadow-blue-600/20 border border-white/20 select-none shrink-0">
              <span>{initials}</span>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-500 border-2 border-zinc-900 flex items-center justify-center">
                <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
              </span>
            </div>

            <div className="space-y-1 min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
                {details?.user_name || "Anonymous User"}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 flex items-center gap-2 truncate">
                <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="truncate">{details?.email || "No email registered"}</span>
              </p>
              <div className="flex items-center gap-2 pt-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />
                  Active Profile
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  Vault Synced
                </span>
                {hasCoordinates && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                    <Compass className="w-3 h-3" />
                    Geo-Anchored
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              id="btn-edit-user-details"
              onClick={onEdit}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600/90 hover:bg-blue-600 text-white shadow-lg shadow-blue-600/25 border border-blue-400/30 transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit Details</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact Information Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-4 sm:p-6 backdrop-blur-xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">Contact Details</h3>
                  <p className="text-xs text-zinc-500">Communication & notifications</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="group flex items-center justify-between p-3 rounded-xl bg-zinc-800/30 border border-white/[0.04] hover:border-white/[0.1] transition-all">
                <div className="flex items-center gap-3 min-w-0">
                  <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                      Email Address
                    </span>
                    <span className="text-sm font-medium text-zinc-200 truncate block">
                      {details?.email || "—"}
                    </span>
                  </div>
                </div>
                {details?.email && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(details.email, "email")}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
                    title="Copy Email"
                  >
                    {copiedField === "email" ? (
                      <span className="text-xs text-emerald-400">Copied!</span>
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              <div className="group flex items-center justify-between p-3 rounded-xl bg-zinc-800/30 border border-white/[0.04] hover:border-white/[0.1] transition-all">
                <div className="flex items-center gap-3 min-w-0">
                  <Phone className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                      Phone Number
                    </span>
                    <span className="text-sm font-medium text-zinc-200 truncate block">
                      {details?.phone_number || "—"}
                    </span>
                  </div>
                </div>
                {details?.phone_number && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(details.phone_number, "phone")}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
                    title="Copy Phone Number"
                  >
                    {copiedField === "phone" ? (
                      <span className="text-xs text-emerald-400">Copied!</span>
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Location & Region Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-4 sm:p-6 backdrop-blur-xl shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">Location & Coordinates</h3>
                  <p className="text-xs text-zinc-500">Geographic parameters in Vault</p>
                </div>
              </div>
            </div>

            {/* Formatted Full Address Row */}
            <div className="group flex items-start justify-between p-3 rounded-xl bg-zinc-800/30 border border-white/[0.04] hover:border-white/[0.1] transition-all">
              <div className="flex items-start gap-3 min-w-0">
                <Navigation className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    Full Address
                  </span>
                  <span className="text-sm font-medium text-zinc-200 block break-words">
                    {details?.address ||
                      [details?.city, details?.state, details?.country]
                        .filter(Boolean)
                        .join(", ") ||
                      "—"}
                  </span>
                </div>
              </div>
              {details?.address && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(details.address, "address")}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer shrink-0 ml-2"
                  title="Copy Full Address"
                >
                  {copiedField === "address" ? (
                    <span className="text-xs text-emerald-400">Copied!</span>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            {/* Region Grid: City, State, Country, Postal Code */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-xl bg-zinc-800/30 border border-white/[0.04]">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                  <Building2 className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">City</span>
                </div>
                <div className="text-xs font-semibold text-zinc-200 truncate" title={details?.city || ""}>
                  {details?.city || "—"}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-800/30 border border-white/[0.04]">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                  <MapPin className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">State</span>
                </div>
                <div className="text-xs font-semibold text-zinc-200 truncate" title={details?.state || ""}>
                  {details?.state || "—"}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-800/30 border border-white/[0.04]">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                  <Globe className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">Country</span>
                </div>
                <div className="text-xs font-semibold text-zinc-200 truncate" title={details?.country || ""}>
                  {details?.country || "—"}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-800/30 border border-white/[0.04]">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                  <Hash className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">Postal</span>
                </div>
                <div className="text-xs font-semibold text-zinc-200 truncate" title={details?.postal_code || ""}>
                  {details?.postal_code || "—"}
                </div>
              </div>
            </div>

            {/* Geographic Coordinates Banner */}
            <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shrink-0">
                  <Compass className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-cyan-400 block">
                    Geographic Coordinates
                  </span>
                  <span className="text-xs text-zinc-200 font-mono font-medium block truncate">
                    {coordinatesDisplay}
                  </span>
                </div>
              </div>

              {hasCoordinates && (
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `${details?.latitude}, ${details?.longitude}`,
                      "coords"
                    )
                  }
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer shrink-0"
                  title="Copy Lat/Lon"
                >
                  {copiedField === "coords" ? (
                    <span className="text-[10px] text-emerald-400">Copied!</span>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
