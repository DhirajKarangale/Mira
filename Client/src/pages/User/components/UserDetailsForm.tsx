import { useState, type FC, type FormEvent, type ChangeEvent, type FocusEvent } from "react";
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
} from "lucide-react";
import { addUserDetails, updateUserDetails } from "../api";
import { validateField, validateUserForm, isFormValid } from "../validation";
import type { UserDetails, UserFormState, UserFormField, UserFormErrors } from "../types";
import { cn } from "@/lib/utils";

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
  const initialValues: UserFormState = {
    user_name: initialData?.user_name ?? "",
    email: initialData?.email ?? "",
    phone_number: initialData?.phone_number ?? "",
    city: initialData?.city ?? "",
    state: initialData?.state ?? "",
    country: initialData?.country ?? "",
  };

  const [formData, setFormData] = useState<UserFormState>(initialValues);
  const [touched, setTouched] = useState<Record<UserFormField, boolean>>({
    user_name: false,
    email: false,
    phone_number: false,
    city: false,
    state: false,
    country: false,
  });
  const [errors, setErrors] = useState<UserFormErrors>(() =>
    mode === "edit" ? validateUserForm(initialValues) : {}
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const formIsValid = isFormValid(errors, formData);

  const handleChange = (field: UserFormField) => (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const updatedForm = { ...formData, [field]: val };
    setFormData(updatedForm);

    // Validate on change if already touched or non-empty
    const fieldError = validateField(field, val);
    setErrors((prev) => ({
      ...prev,
      [field]: fieldError,
    }));

    if (submitError) {
      setSubmitError(null);
    }
  };

  const handleBlur = (field: UserFormField) => (_e: FocusEvent<HTMLInputElement>) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const fieldError = validateField(field, formData[field]);
    setErrors((prev) => ({
      ...prev,
      [field]: fieldError,
    }));
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
    });
    setErrors(mode === "edit" ? validateUserForm(initialValues) : {});
    setSubmitError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Mark all fields as touched
    setTouched({
      user_name: true,
      email: true,
      phone_number: true,
      city: true,
      state: true,
      country: true,
    });

    // Run strict full validation
    const currentErrors = validateUserForm(formData);
    setErrors(currentErrors);

    if (Object.keys(currentErrors).length > 0) {
      setSubmitError("Please correct the validation errors below before submitting.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      let result: UserDetails;
      if (mode === "add") {
        result = await addUserDetails(formData);
      } else {
        result = await updateUserDetails(formData);
      }
      onSaveSuccess(result);
    } catch (err: any) {
      console.error("Failed to save user details to Vault:", err);
      const message =
        err?.response?.data?.detail?.message ||
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to save user details to Vault. Please try again.";
      setSubmitError(typeof message === "string" ? message : JSON.stringify(message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      id="user-details-form"
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/[0.08] gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-blue-400" />
            <span>{mode === "add" ? "Create User Details" : "Edit User Details"}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            All fields are strictly validated and stored with AES-256-GCM encryption in Vault.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
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

      {/* Global submission error banner */}
      {submitError && (
        <div
          id="form-submit-error-banner"
          className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm animate-in fade-in"
        >
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-rose-200">Validation or Transmission Error</p>
            <p className="text-xs text-rose-300 mt-0.5">{submitError}</p>
          </div>
        </div>
      )}

      {/* Section 1: Identity & Primary Info */}
      <div className="space-y-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-2">
          <span>01. Personal Identity</span>
          <div className="h-px bg-white/[0.06] flex-1" />
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* User Name */}
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

          {/* Email Address */}
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
        </div>
      </div>

      {/* Section 2: Contact Number */}
      <div className="space-y-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-2">
          <span>02. Communication</span>
          <div className="h-px bg-white/[0.06] flex-1" />
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Phone Number */}
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

      {/* Section 3: Geographic Region */}
      <div className="space-y-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-2">
          <span>03. Geographic Location</span>
          <div className="h-px bg-white/[0.06] flex-1" />
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* City */}
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
              <span className="text-[10px] text-zinc-500 font-mono">Letters & spaces</span>
            </label>
            <div className="relative">
              <input
                id="field-city"
                type="text"
                value={formData.city}
                onChange={handleChange("city")}
                onBlur={handleBlur("city")}
                placeholder="e.g. San Francisco"
                autoComplete="address-level2"
                disabled={submitting}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800/40 text-sm text-zinc-100 placeholder:text-zinc-600 border transition-all duration-150 outline-none",
                  "focus:ring-2 focus:ring-purple-500/20",
                  touched.city && errors.city
                    ? "border-rose-500/50 bg-rose-500/[0.03] focus:border-rose-500"
                    : touched.city && !errors.city && formData.city.trim()
                    ? "border-emerald-500/40 bg-emerald-500/[0.02] focus:border-emerald-500"
                    : "border-white/[0.08] focus:border-purple-500/50 hover:border-white/[0.14]"
                )}
              />
              {touched.city && !errors.city && formData.city.trim() && (
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

          {/* State */}
          <div className="space-y-1.5">
            <label
              htmlFor="field-state"
              className="text-xs font-medium text-zinc-300 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-purple-400" />
                <span>State</span>
                <span className="text-rose-400">*</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Letters & spaces</span>
            </label>
            <div className="relative">
              <input
                id="field-state"
                type="text"
                value={formData.state}
                onChange={handleChange("state")}
                onBlur={handleBlur("state")}
                placeholder="e.g. California"
                autoComplete="address-level1"
                disabled={submitting}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800/40 text-sm text-zinc-100 placeholder:text-zinc-600 border transition-all duration-150 outline-none",
                  "focus:ring-2 focus:ring-purple-500/20",
                  touched.state && errors.state
                    ? "border-rose-500/50 bg-rose-500/[0.03] focus:border-rose-500"
                    : touched.state && !errors.state && formData.state.trim()
                    ? "border-emerald-500/40 bg-emerald-500/[0.02] focus:border-emerald-500"
                    : "border-white/[0.08] focus:border-purple-500/50 hover:border-white/[0.14]"
                )}
              />
              {touched.state && !errors.state && formData.state.trim() && (
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

          {/* Country */}
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
              <span className="text-[10px] text-zinc-500 font-mono">Letters & spaces</span>
            </label>
            <div className="relative">
              <input
                id="field-country"
                type="text"
                value={formData.country}
                onChange={handleChange("country")}
                onBlur={handleBlur("country")}
                placeholder="e.g. United States"
                autoComplete="country-name"
                disabled={submitting}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800/40 text-sm text-zinc-100 placeholder:text-zinc-600 border transition-all duration-150 outline-none",
                  "focus:ring-2 focus:ring-purple-500/20",
                  touched.country && errors.country
                    ? "border-rose-500/50 bg-rose-500/[0.03] focus:border-rose-500"
                    : touched.country && !errors.country && formData.country.trim()
                    ? "border-emerald-500/40 bg-emerald-500/[0.02] focus:border-emerald-500"
                    : "border-white/[0.08] focus:border-purple-500/50 hover:border-white/[0.14]"
                )}
              />
              {touched.country && !errors.country && formData.country.trim() && (
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
      </div>

      {/* Form Action Controls */}
      <div className="pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-xs text-zinc-500">
          {!formIsValid ? (
            <span className="flex items-center gap-1.5 text-amber-400/90">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>All 6 fields are required with valid formatting before saving.</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>All fields validated. Ready to save to Vault.</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {initialData?.exists && (
            <button
              type="button"
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
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 border border-blue-400/30"
                : "bg-zinc-800 text-zinc-500 border border-white/[0.05] cursor-not-allowed opacity-60 shadow-none"
            )}
            title={!formIsValid ? "Please fill all required fields correctly to enable saving" : "Save user details to Vault"}
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
