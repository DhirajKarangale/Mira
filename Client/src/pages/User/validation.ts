import type { UserFormState, UserFormField, UserFormErrors } from "./types";

/**
 * Validation patterns for User form fields.
 */
// Letters, spaces, apostrophes, and hyphens (supporting international Latin characters)
const NAME_REGEX = /^[a-zA-ZÀ-ÿ\s'-]+$/;

// Standard RFC-compliant email address pattern
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Phone number: optional leading +, digits, spaces, parentheses, hyphens
const PHONE_CHARS_REGEX = /^\+?[\d\s().-]+$/;

// Location names (City, State, Country): letters, spaces, hyphens, apostrophes, periods
const LOCATION_NAME_REGEX = /^[a-zA-ZÀ-ÿ\s.'-]+$/;

/**
 * Validates a single field and returns an error message if invalid, or undefined if valid.
 */
export function validateField(field: UserFormField, value: string): string | undefined {
  const trimmed = value.trim();

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
        return "Email address is required.";
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
        return "Phone number is required.";
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
      if (trimmed.length > 50) {
        return "City name cannot exceed 50 characters.";
      }
      if (!LOCATION_NAME_REGEX.test(trimmed)) {
        return "City can only contain letters and spaces.";
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
      if (trimmed.length > 50) {
        return "State name cannot exceed 50 characters.";
      }
      if (!LOCATION_NAME_REGEX.test(trimmed)) {
        return "State can only contain letters and spaces.";
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
      if (trimmed.length > 60) {
        return "Country name cannot exceed 60 characters.";
      }
      if (!LOCATION_NAME_REGEX.test(trimmed)) {
        return "Country can only contain letters and spaces.";
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

/**
 * Validates all fields in the form and returns a map of errors.
 */
export function validateUserForm(values: UserFormState): UserFormErrors {
  const errors: UserFormErrors = {};
  const fields: UserFormField[] = [
    "user_name",
    "email",
    "phone_number",
    "city",
    "state",
    "country",
  ];

  for (const field of fields) {
    const error = validateField(field, values[field]);
    if (error) {
      errors[field] = error;
    }
  }

  return errors;
}

/**
 * Checks whether the entire form is valid (no errors and all required fields populated).
 */
export function isFormValid(errors: UserFormErrors, values: UserFormState): boolean {
  const fields: UserFormField[] = [
    "user_name",
    "email",
    "phone_number",
    "city",
    "state",
    "country",
  ];

  // Must not have any active error
  const hasErrors = fields.some((f) => !!errors[f]);
  if (hasErrors) return false;

  // All fields must be non-empty and pass validateField
  for (const field of fields) {
    const value = values[field]?.trim() ?? "";
    if (!value) return false;
    if (validateField(field, value)) return false;
  }

  return true;
}
