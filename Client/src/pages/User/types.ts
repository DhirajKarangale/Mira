export interface UserDetails {
  user_name: string | null;
  email: string | null;
  phone_number: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  exists?: boolean;
  message?: string;
}

export interface UserFormState {
  user_name: string;
  email: string;
  phone_number: string;
  city: string;
  state: string;
  country: string;
  address: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
}

export type UserFormField = keyof UserFormState;

export type UserFormErrors = Partial<Record<UserFormField, string>>;

export type UserPageMode = "view" | "edit" | "add";

export const DEFAULT_USER_DATA: UserFormState = {
  user_name: "",
  email: "",
  phone_number: "",
  city: "",
  state: "",
  country: "",
  address: "",
  postal_code: "",
  latitude: null,
  longitude: null,
};
