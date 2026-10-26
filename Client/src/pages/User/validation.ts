import type { UserFormState, UserFormField, UserFormErrors } from "./types";

const NAME_REGEX = /^[\p{L}\p{M}\s'-]+$/u;
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const PHONE_CHARS_REGEX = /^\+?[\d\s().-]+$/;
const LOCATION_NAME_REGEX = /^[\p{L}\p{M}\p{N}\s.'(),/-]+$/u;
const POSTAL_CODE_REGEX = /^[a-zA-Z0-9\s-]+$/;

export function validateField(
  field: UserFormField,
  value: string | number | null | undefined
): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : value != null ? String(value).trim() : "";

  switch (field) {
    case "user_name": {
      if (!trimmed) {
        return "User Name is required.";
      }
      if (trimmed.length < 2) {
        return "User Name must be at least 2 characters.";
      }
      if (trimmed.length > 60) {
        return "User Name cannot exceed 60 characters.";
      }
      if (!NAME_REGEX.test(trimmed)) {
        return "User Name can only contain letters, spaces, hyphens, and apostrophes.";
      }
      return undefined;
    }

    case "email": {
      if (!trimmed) {
        return undefined;
      }
      if (!EMAIL_REGEX.test(trimmed)) {
        return "Please enter a valid email address (e.g. user@example.com).";
      }
      if (trimmed.length > 100) {
        return "Email address cannot exceed 100 characters.";
      }
      return undefined;
    }

    case "phone_number": {
      if (!trimmed) {
        return undefined;
      }
      if (!PHONE_CHARS_REGEX.test(trimmed)) {
        return "Phone number can only contain digits, spaces, hyphens, parentheses, and optional leading '+'.";
      }
      const digitsOnly = trimmed.replace(/\D/g, "");
      if (digitsOnly.length < 7) {
        return "Phone number must contain at least 7 digits.";
      }
      if (digitsOnly.length > 15) {
        return "Phone number cannot exceed 15 digits.";
      }
      return undefined;
    }

    case "city": {
      if (!trimmed) {
        return "City is required.";
      }
      if (trimmed.length < 2) {
        return "City name must be at least 2 characters.";
      }
      if (trimmed.length > 80) {
        return "City name cannot exceed 80 characters.";
      }
      if (/^\d+$/.test(trimmed)) {
        return "City name cannot be purely numeric.";
      }
      if (!LOCATION_NAME_REGEX.test(trimmed)) {
        return "City contains invalid characters.";
      }
      return undefined;
    }

    case "state": {
      if (!trimmed) {
        return "State is required.";
      }
      if (trimmed.length < 2) {
        return "State name must be at least 2 characters.";
      }
      if (trimmed.length > 80) {
        return "State name cannot exceed 80 characters.";
      }
      if (!LOCATION_NAME_REGEX.test(trimmed)) {
        return "State contains invalid characters.";
      }
      return undefined;
    }

    case "country": {
      if (!trimmed) {
        return "Country is required.";
      }
      if (trimmed.length < 2) {
        return "Country name must be at least 2 characters.";
      }
      if (trimmed.length > 80) {
        return "Country name cannot exceed 80 characters.";
      }
      if (!LOCATION_NAME_REGEX.test(trimmed)) {
        return "Country contains invalid characters.";
      }
      return undefined;
    }

    case "address": {
      if (trimmed && trimmed.length > 300) {
        return "Address cannot exceed 300 characters.";
      }
      return undefined;
    }

    case "postal_code": {
      // Missing or empty postal codes are handled without error
      if (!trimmed) {
        return undefined;
      }
      if (trimmed.length < 2) {
        return "Postal code must be at least 2 characters.";
      }
      if (trimmed.length > 20) {
        return "Postal code cannot exceed 20 characters.";
      }
      if (!POSTAL_CODE_REGEX.test(trimmed)) {
        return "Postal code can only contain letters, numbers, spaces, and hyphens.";
      }
      return undefined;
    }

    case "latitude": {
      if (value === null || value === undefined || trimmed === "") {
        return undefined;
      }
      const num = Number(value);
      if (Number.isNaN(num) || num < -90 || num > 90) {
        return "Latitude must be a valid number between -90 and 90.";
      }
      return undefined;
    }

    case "longitude": {
      if (value === null || value === undefined || trimmed === "") {
        return undefined;
      }
      const num = Number(value);
      if (Number.isNaN(num) || num < -180 || num > 180) {
        return "Longitude must be a valid number between -180 and 180.";
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

export function validateUserForm(values: UserFormState): UserFormErrors {
  const errors: UserFormErrors = {};
  const fields: UserFormField[] = [
    "user_name",
    "email",
    "phone_number",
    "city",
    "state",
    "country",
    "address",
    "postal_code",
    "latitude",
    "longitude",
  ];

  for (const field of fields) {
    const error = validateField(field, values[field]);
    if (error) {
      errors[field] = error;
    }
  }

  return errors;
}

export function isFormValid(errors: UserFormErrors, values: UserFormState): boolean {
  const hasErrors = Object.values(errors).some((err) => Boolean(err));
  if (hasErrors) return false;

  const requiredFields: (keyof UserFormState)[] = [
    "user_name",
    "city",
    "state",
    "country",
  ];

  for (const field of requiredFields) {
    const value = String(values[field] ?? "").trim();
    if (!value) return false;
    if (validateField(field, value)) return false;
  }

  if (values.email && validateField("email", values.email)) return false;
  if (values.phone_number && validateField("phone_number", values.phone_number)) return false;
  if (values.address && validateField("address", values.address)) return false;
  if (values.postal_code && validateField("postal_code", values.postal_code)) return false;
  if (values.latitude != null && validateField("latitude", values.latitude)) return false;
  if (values.longitude != null && validateField("longitude", values.longitude)) return false;

  return true;
}
