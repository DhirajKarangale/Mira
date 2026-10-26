import { useState, type FC, type FormEvent, type ChangeEvent } from "react";
import {
  User,
  Mail,
  Phone,
  Building2,
  MapPin,
  Globe,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Navigation,
  Hash,
  Compass,
  Lock,
} from "lucide-react";
import { useSaveUserDetailsMutation } from "../queries";
import { validateField, validateUserForm, isFormValid } from "../validation";
import { LocationSearch } from "./LocationSearch";
import {
  DEFAULT_USER_DATA,
  type UserDetails,
  type UserFormState,
  type UserFormField,
  type UserFormErrors,
} from "../types";
import {
  formatGeocodingAddress,
  extractPostalCode,
  fetchPostalCodeFromCoordinates,
  isPostalCodeString,
  type GeocodingResult,
} from "@/services";
import { cn } from "@/lib/utils";
import { toast } from "@/components";

interface UserDetailsFormProps {
  initialData: UserDetails | null;
  mode: "add" | "edit";
  onSaveSuccess: (updated: UserDetails) => void;
  onCancel: () => void;
}

export const UserDetailsForm: FC<UserDetailsFormProps> = ({
  initialData,
  mode,
  onSaveSuccess,
  onCancel,
}) => {
  const saveMutation = useSaveUserDetailsMutation();

  const initialValues: UserFormState = {
    user_name: initialData?.user_name || DEFAULT_USER_DATA.user_name,
    email: initialData?.email || DEFAULT_USER_DATA.email,
    phone_number: initialData?.phone_number || DEFAULT_USER_DATA.phone_number,
    city: initialData?.city || DEFAULT_USER_DATA.city,
    state: initialData?.state || DEFAULT_USER_DATA.state,
    country: initialData?.country || DEFAULT_USER_DATA.country,
    address: initialData?.address ?? (initialData ? "" : DEFAULT_USER_DATA.address),
    postal_code: initialData?.postal_code ?? (initialData ? "" : DEFAULT_USER_DATA.postal_code),
    latitude: initialData?.latitude ?? (initialData ? null : DEFAULT_USER_DATA.latitude),
    longitude: initialData?.longitude ?? (initialData ? null : DEFAULT_USER_DATA.longitude),
  };

  const [formData, setFormData] = useState<UserFormState>(initialValues);
  const [touched, setTouched] = useState<Record<UserFormField, boolean>>({
    user_name: false,
    email: false,
    phone_number: false,
    city: false,
    state: false,
    country: false,
    address: false,
    postal_code: false,
    latitude: false,
    longitude: false,
  });

  const [errors, setErrors] = useState<UserFormErrors>(() =>
    mode === "edit" ? validateUserForm(initialValues) : {}
  );

  const submitting = saveMutation.isPending;
  const formIsValid = isFormValid(errors, formData);

  const handleChange =
    (field: UserFormField) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const rawVal = e.target.value;
      let val: string | number | null = rawVal;

      if (field === "latitude" || field === "longitude") {
        if (rawVal === "") {
          val = null;
        } else {
          const parsed = parseFloat(rawVal);
          val = Number.isNaN(parsed) ? (rawVal as any) : parsed;
        }
      }

      const updatedForm = { ...formData, [field]: val } as UserFormState;
      setFormData(updatedForm);

      const fieldError = validateField(field, val);
      setErrors((prev) => ({
        ...prev,
        [field]: fieldError,
      }));
    };

  const handleBlur = (field: UserFormField) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const fieldError = validateField(field, formData[field]);
    setErrors((prev) => ({
      ...prev,
      [field]: fieldError,
    }));
  };

  const handleLocationSelect = (result: GeocodingResult) => {
    const formattedAddress = formatGeocodingAddress(result);
    const postalCode = extractPostalCode(result);
    
    // Resolve clean city name - ensure numeric postal codes never become city name
    const isPostcode = isPostalCodeString(result.name);
    const resolvedCity =
      result.city ||
      (!isPostcode ? result.name : "") ||
      result.admin2 ||
      result.admin1 ||
      "";

    const city = resolvedCity || formData.city;
    const state = result.admin1 || result.admin2 || formData.state;
    const country = result.country || formData.country;
    const latitude = result.latitude;
    const longitude = result.longitude;

    const updated: UserFormState = {
      ...formData,
      address: formattedAddress,
      postal_code: postalCode || (isPostcode ? result.name : formData.postal_code),
      city,
      state,
      country,
      latitude,
      longitude,
    };

    setFormData(updated);

    // Mark updated fields as touched
    setTouched((prev) => ({
      ...prev,
      address: true,
      postal_code: true,
      city: true,
      state: true,
      country: true,
      latitude: true,
      longitude: true,
    }));

    setErrors(validateUserForm(updated));

    // If postal code wasn't directly returned by Open-Meteo, query reverse geocoding
    if (!postalCode && result.latitude != null && result.longitude != null) {
      fetchPostalCodeFromCoordinates(result.latitude, result.longitude).then((resolvedPostal) => {
        if (resolvedPostal) {
          setFormData((prev) => ({
            ...prev,
            postal_code: resolvedPostal,
          }));
        }
      });
    }

    toast.success(
      `Selected "${result.name}"${postalCode ? ` (${postalCode})` : ""}`,
      { title: "Location Applied" }
    );
  };

  const handleReset = () => {
    setFormData(initialValues);
    setTouched({
      user_name: false,
      email: false,
      phone_number: false,
      city: false,
      state: false,
      country: false,
      address: false,
      postal_code: false,
      latitude: false,
      longitude: false,
    });
    setErrors(mode === "edit" ? validateUserForm(initialValues) : {});
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    setTouched({
      user_name: true,
      email: true,
      phone_number: true,
      city: true,
      state: true,
      country: true,
      address: true,
      postal_code: true,
      latitude: true,
      longitude: true,
    });

    const currentErrors = validateUserForm(formData);
    setErrors(currentErrors);

    if (Object.keys(currentErrors).length > 0) {
      toast.warning("Please correct the validation errors in the form before submitting.", {
        title: "Validation Incomplete",
      });
      return;
    }

    try {
      const result = await saveMutation.mutateAsync({
        isAdd: mode === "add",
        data: formData,
      });
      onSaveSuccess(result);
    } catch (err: any) {
      console.error("Failed to save user details to Vault:", err);
      const message =
        err?.response?.data?.detail?.message ||
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to save user details to Vault. Please try again.";
      const msgStr = typeof message === "string" ? message : JSON.stringify(message);
      toast.error(msgStr, { title: "Vault Transmission Error" });
    }
  };

  return (
    <form
      id="user-details-form"
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-7"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/[0.08] gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-blue-400" />
            <span>{mode === "add" ? "Create User Details" : "Edit User Details"}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Store identity, contact, and geographic location coordinates with AES-256 encryption in Vault.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            id="btn-form-reset"
            onClick={handleReset}
            disabled={submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-300 hover:text-white border border-white/[0.06] transition-all cursor-pointer disabled:opacity-50"
            title="Reset form to original values"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          {initialData?.exists && (
            <button
              type="button"
              id="btn-form-cancel"
              onClick={onCancel}
              disabled={submitting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-300 hover:text-white border border-white/[0.06] transition-all cursor-pointer disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* 01. Personal Identity */}
      <div className="space-y-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-2">
          <span>01. Personal Identity</span>
          <div className="h-px bg-white/[0.06] flex-1" />
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label
              htmlFor="field-user-name"
              className="text-xs font-medium text-zinc-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-400" />
                <span>User Name</span>
                <span className="text-rose-400">*</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Letters & spaces</span>
            </label>
            <div className="relative">
              <input
                id="field-user-name"
                type="text"
                value={formData.user_name}
                onChange={handleChange("user_name")}
                onBlur={handleBlur("user_name")}
                placeholder="e.g. Dhiraj Karangale"
                autoComplete="name"
                disabled={submitting}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800/40 text-sm text-zinc-100 placeholder:text-zinc-600 border transition-all duration-150 outline-none",
                  "focus:ring-2 focus:ring-blue-500/20",
                  touched.user_name && errors.user_name
                    ? "border-rose-500/50 bg-rose-500/[0.03] focus:border-rose-500"
                    : touched.user_name && !errors.user_name && formData.user_name.trim()
                    ? "border-emerald-500/40 bg-emerald-500/[0.02] focus:border-emerald-500"
                    : "border-white/[0.08] focus:border-blue-500/50 hover:border-white/[0.14]"
                )}
              />
              {touched.user_name && !errors.user_name && formData.user_name.trim() && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-3 pointer-events-none" />
              )}
            </div>
            {touched.user_name && errors.user_name && (
              <p
                id="error-user-name"
                className="text-xs text-rose-400 flex items-center gap-1.5 pt-0.5 animate-in fade-in"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errors.user_name}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 02. Communication */}
      <div className="space-y-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-2">
          <span>02. Communication</span>
          <div className="h-px bg-white/[0.06] flex-1" />
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label
              htmlFor="field-email"
              className="text-xs font-medium text-zinc-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-blue-400" />
                <span>Email Address</span>
                <span className="text-rose-400">*</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">user@domain.com</span>
            </label>
            <div className="relative">
              <input
                id="field-email"
                type="email"
                value={formData.email}
                onChange={handleChange("email")}
                onBlur={handleBlur("email")}
                placeholder="e.g. dhiraj@example.com"
                autoComplete="email"
                disabled={submitting}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800/40 text-sm text-zinc-100 placeholder:text-zinc-600 border transition-all duration-150 outline-none",
                  "focus:ring-2 focus:ring-blue-500/20",
                  touched.email && errors.email
                    ? "border-rose-500/50 bg-rose-500/[0.03] focus:border-rose-500"
                    : touched.email && !errors.email && formData.email.trim()
                    ? "border-emerald-500/40 bg-emerald-500/[0.02] focus:border-emerald-500"
                    : "border-white/[0.08] focus:border-blue-500/50 hover:border-white/[0.14]"
                )}
              />
              {touched.email && !errors.email && formData.email.trim() && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-3 pointer-events-none" />
              )}
            </div>
            {touched.email && errors.email && (
              <p
                id="error-email"
                className="text-xs text-rose-400 flex items-center gap-1.5 pt-0.5 animate-in fade-in"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errors.email}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="field-phone-number"
              className="text-xs font-medium text-zinc-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-blue-400" />
                <span>Phone Number</span>
                <span className="text-rose-400">*</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">7-15 digits</span>
            </label>
            <div className="relative">
              <input
                id="field-phone-number"
                type="tel"
                value={formData.phone_number}
                onChange={handleChange("phone_number")}
                onBlur={handleBlur("phone_number")}
                placeholder="e.g. +1 555-019-2834 or +91 9876543210"
                autoComplete="tel"
                disabled={submitting}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800/40 text-sm text-zinc-100 placeholder:text-zinc-600 border transition-all duration-150 outline-none",
                  "focus:ring-2 focus:ring-blue-500/20",
                  touched.phone_number && errors.phone_number
                    ? "border-rose-500/50 bg-rose-500/[0.03] focus:border-rose-500"
                    : touched.phone_number && !errors.phone_number && formData.phone_number.trim()
                    ? "border-emerald-500/40 bg-emerald-500/[0.02] focus:border-emerald-500"
                    : "border-white/[0.08] focus:border-blue-500/50 hover:border-white/[0.14]"
                )}
              />
              {touched.phone_number && !errors.phone_number && formData.phone_number.trim() && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-3 pointer-events-none" />
              )}
            </div>
            {touched.phone_number && errors.phone_number && (
              <p
                id="error-phone-number"
                className="text-xs text-rose-400 flex items-center gap-1.5 pt-0.5 animate-in fade-in"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errors.phone_number}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 03. Geographic Location & Coordinates */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-2">
            <span>03. Geographic Location & Coordinates</span>
            <div className="h-px bg-white/[0.06] flex-1" />
          </h3>
          <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1.5 self-start sm:self-auto">
            <Lock className="w-3 h-3 text-cyan-400/80" />
            <span>Fields below are populated via Location Lookup API</span>
          </span>
        </div>

        {/* Live Open-Meteo Geocoding Search */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/[0.06] space-y-3">
          <LocationSearch
            onSelectLocation={handleLocationSelect}
            disabled={submitting}
          />
        </div>

        {/* Full Formatted Address */}
        <div className="space-y-1.5">
          <label
            htmlFor="field-address"
            className="text-xs font-medium text-zinc-300 flex items-center justify-between"
          >
            <span className="flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-cyan-400" />
              <span>Full Address</span>
            </span>
            <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" />
              <span>API Generated (Read-only)</span>
            </span>
          </label>
          <div className="relative">
            <input
              id="field-address"
              type="text"
              value={formData.address}
              readOnly
              tabIndex={-1}
              placeholder="Search and select a location above to auto-fill"
              autoComplete="off"
              className={cn(
                "w-full px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 outline-none cursor-not-allowed select-all",
                "bg-zinc-900/70 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 hover:border-white/[0.08]"
              )}
            />
            {formData.address.trim() && (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-3 pointer-events-none" />
            )}
          </div>
        </div>

        {/* Region hierarchy: City, State, Country */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="space-y-1.5">
            <label
              htmlFor="field-city"
              className="text-xs font-medium text-zinc-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-purple-400" />
                <span>City</span>
                <span className="text-rose-400">*</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                <span>Read-only</span>
              </span>
            </label>
            <div className="relative">
              <input
                id="field-city"
                type="text"
                value={formData.city}
                readOnly
                tabIndex={-1}
                placeholder="Derived from location"
                autoComplete="off"
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 outline-none cursor-not-allowed select-all",
                  "bg-zinc-900/70 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 hover:border-white/[0.08]",
                  touched.city && errors.city && "border-rose-500/50"
                )}
              />
              {formData.city.trim() && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-3 pointer-events-none" />
              )}
            </div>
            {touched.city && errors.city && (
              <p
                id="error-city"
                className="text-xs text-rose-400 flex items-center gap-1.5 pt-0.5 animate-in fade-in"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errors.city}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="field-state"
              className="text-xs font-medium text-zinc-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-purple-400" />
                <span>State / Region</span>
                <span className="text-rose-400">*</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                <span>Read-only</span>
              </span>
            </label>
            <div className="relative">
              <input
                id="field-state"
                type="text"
                value={formData.state}
                readOnly
                tabIndex={-1}
                placeholder="Derived from location"
                autoComplete="off"
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 outline-none cursor-not-allowed select-all",
                  "bg-zinc-900/70 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 hover:border-white/[0.08]",
                  touched.state && errors.state && "border-rose-500/50"
                )}
              />
              {formData.state.trim() && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-3 pointer-events-none" />
              )}
            </div>
            {touched.state && errors.state && (
              <p
                id="error-state"
                className="text-xs text-rose-400 flex items-center gap-1.5 pt-0.5 animate-in fade-in"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errors.state}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="field-country"
              className="text-xs font-medium text-zinc-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-purple-400" />
                <span>Country</span>
                <span className="text-rose-400">*</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                <span>Read-only</span>
              </span>
            </label>
            <div className="relative">
              <input
                id="field-country"
                type="text"
                value={formData.country}
                readOnly
                tabIndex={-1}
                placeholder="Derived from location"
                autoComplete="off"
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 outline-none cursor-not-allowed select-all",
                  "bg-zinc-900/70 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 hover:border-white/[0.08]",
                  touched.country && errors.country && "border-rose-500/50"
                )}
              />
              {formData.country.trim() && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-3 pointer-events-none" />
              )}
            </div>
            {touched.country && errors.country && (
              <p
                id="error-country"
                className="text-xs text-rose-400 flex items-center gap-1.5 pt-0.5 animate-in fade-in"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errors.country}</span>
              </p>
            )}
          </div>
        </div>

        {/* Detailed fields: Postal Code, Latitude, Longitude */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-1">
          <div className="space-y-1.5">
            <label
              htmlFor="field-postal-code"
              className="text-xs font-medium text-zinc-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-purple-400" />
                <span>Postal / ZIP Code</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                Auto-derived or customizable
              </span>
            </label>
            <div className="relative">
              <input
                id="field-postal-code"
                type="text"
                value={formData.postal_code}
                onChange={handleChange("postal_code")}
                onBlur={handleBlur("postal_code")}
                placeholder="e.g. 444203 or 411001"
                autoComplete="postal-code"
                disabled={submitting}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 outline-none",
                  "bg-zinc-800/40 border-white/[0.08] hover:border-white/[0.14] text-zinc-100 placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20",
                  touched.postal_code && errors.postal_code && "border-rose-500/50"
                )}
              />
              {formData.postal_code.trim() && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-3 pointer-events-none" />
              )}
            </div>
            {touched.postal_code && errors.postal_code ? (
              <p
                id="error-postal-code"
                className="text-xs text-rose-400 flex items-center gap-1.5 pt-0.5 animate-in fade-in"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errors.postal_code}</span>
              </p>
            ) : (
              <p className="text-[10px] text-zinc-500">
                Populated from location API or PIN/postal code search. Can be fine-tuned.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="field-latitude"
              className="text-xs font-medium text-zinc-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span>Latitude</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                <span>Read-only</span>
              </span>
            </label>
            <div className="relative">
              <input
                id="field-latitude"
                type="text"
                value={formData.latitude != null ? String(formData.latitude) : ""}
                readOnly
                tabIndex={-1}
                placeholder="Auto-derived"
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 outline-none font-mono cursor-not-allowed select-all",
                  "bg-zinc-900/70 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 hover:border-white/[0.08]"
                )}
              />
              {formData.latitude != null && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-3 pointer-events-none" />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="field-longitude"
              className="text-xs font-medium text-zinc-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span>Longitude</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                <span>Read-only</span>
              </span>
            </label>
            <div className="relative">
              <input
                id="field-longitude"
                type="text"
                value={formData.longitude != null ? String(formData.longitude) : ""}
                readOnly
                tabIndex={-1}
                placeholder="Auto-derived"
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 outline-none font-mono cursor-not-allowed select-all",
                  "bg-zinc-900/70 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 hover:border-white/[0.08]"
                )}
              />
              {formData.longitude != null && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-3 pointer-events-none" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Form Submission Actions */}
      <div className="pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-xs text-zinc-500">
          {!formIsValid ? (
            <span className="flex items-center gap-1.5 text-amber-400/90">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Fill required identity and location fields with valid formatting.</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>All fields validated. Ready to encrypt & store in Vault.</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {initialData?.exists && (
            <button
              type="button"
              id="btn-footer-cancel"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white border border-white/[0.08] transition-all cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            id="btn-save-user-details"
            disabled={!formIsValid || submitting}
            className={cn(
              "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg transition-all duration-200 cursor-pointer active:scale-95",
              formIsValid && !submitting
                ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:via-indigo-500 hover:to-cyan-500 text-white shadow-blue-500/25 border border-blue-400/30"
                : "bg-zinc-800 text-zinc-500 border border-white/[0.05] cursor-not-allowed opacity-60 shadow-none"
            )}
            title={!formIsValid ? "Please complete required fields to enable saving" : "Save user details to Vault"}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span>Saving to Vault...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{mode === "add" ? "Save Details to Vault" : "Update Details in Vault"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
};
