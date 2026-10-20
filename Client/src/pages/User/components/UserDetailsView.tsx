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
} from "lucide-react";
import { useState } from "react";
import type { UserDetails } from "../types";

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
      details?.user_name ||
      details?.email ||
      details?.phone_number ||
      details?.city ||
      details?.state ||
      details?.country
    );

  if (!hasData) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-8 sm:p-12 text-center backdrop-blur-xl shadow-xl flex flex-col items-center justify-center">
        <div className="w-20 h-20 rounded-3xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
          <User className="w-10 h-10" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
          No User Profile Configured
        </h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
          Your profile information is not yet configured in Vault. Add your name, email, phone number,
          and regional coordinates to get started.
        </p>
        <button
          type="button"
          id="btn-add-user-details-empty"
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 transition-all duration-200 active:scale-95 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Add User Details</span>
        </button>
      </div>
    );
  }

  // Derive initials
  const initials =
    details?.user_name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join("") || "U";

  return (
    <div className="space-y-6">
      {/* Top Profile Summary Card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-6 sm:p-8 backdrop-blur-xl shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* User Initials Avatar */}
            <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white font-bold text-2xl shadow-xl shadow-blue-600/20 border border-white/20 select-none">
              <span>{initials}</span>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-zinc-900 flex items-center justify-center">
                <CheckCircle className="w-3 h-3 text-white" />
              </span>
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {details?.user_name || "Anonymous User"}
              </h2>
              <p className="text-sm text-zinc-400 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-zinc-500" />
                <span>{details?.email || "No email registered"}</span>
              </p>
              <div className="flex items-center gap-2 pt-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />
                  Active Profile
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  Vault Synced
                </span>
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

      {/* Grid of Profile Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact Information Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-6 backdrop-blur-xl shadow-xl flex flex-col justify-between">
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
              {/* Email */}
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
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all"
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

              {/* Phone Number */}
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
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all"
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

        {/* Location & Regional Coordinates Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-6 backdrop-blur-xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">Location & Region</h3>
                  <p className="text-xs text-zinc-500">Geographic parameters in Vault</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* City */}
              <div className="p-3 rounded-xl bg-zinc-800/30 border border-white/[0.04]">
                <div className="flex items-center gap-2 text-zinc-500 mb-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">City</span>
                </div>
                <div className="text-sm font-medium text-zinc-200 truncate">
                  {details?.city || "—"}
                </div>
              </div>

              {/* State */}
              <div className="p-3 rounded-xl bg-zinc-800/30 border border-white/[0.04]">
                <div className="flex items-center gap-2 text-zinc-500 mb-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">State</span>
                </div>
                <div className="text-sm font-medium text-zinc-200 truncate">
                  {details?.state || "—"}
                </div>
              </div>

              {/* Country */}
              <div className="p-3 rounded-xl bg-zinc-800/30 border border-white/[0.04]">
                <div className="flex items-center gap-2 text-zinc-500 mb-1">
                  <Globe className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Country</span>
                </div>
                <div className="text-sm font-medium text-zinc-200 truncate">
                  {details?.country || "—"}
                </div>
              </div>
            </div>

            {/* Combined location string */}
            <div className="mt-4 p-3 rounded-xl bg-purple-500/[0.04] border border-purple-500/10 flex items-center gap-2.5">
              <Globe className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-xs text-zinc-300">
                {[details?.city, details?.state, details?.country].filter(Boolean).join(", ") ||
                  "No regional location configured"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
