export interface UserDetails {
  user_name: string | null;
  email: string | null;
  phone_number: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
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
}

export type UserFormField = keyof UserFormState;

export type UserFormErrors = Partial<Record<UserFormField, string>>;

export type UserPageMode = "view" | "edit" | "add";

export const DEFAULT_USER_DATA: UserFormState = {
  user_name: "Dhiraj",
  email: "dakarangale02@gmail.com",
  phone_number: "+91 7620320595",
  city: "Pune",
  state: "Maharashtra",
  country: "India",
};
