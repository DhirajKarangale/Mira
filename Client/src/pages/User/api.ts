import { vaultApi } from "@/lib/api";
import type { UserDetails, UserFormState } from "./types";

/**
 * Retrieve user details from Vault.
 * Uses Axios client configured for Vault (http://127.0.0.1:8001).
 */
export async function fetchUserDetails(): Promise<UserDetails> {
  const response = await vaultApi.get<UserDetails>("/user");
  return response.data;
}

/**
 * Add or save user details in Vault.
 * Uses Axios client configured for Vault.
 */
export async function addUserDetails(
  data: UserFormState
): Promise<UserDetails> {
  const response = await vaultApi.post<UserDetails>("/user", data);
  return response.data;
}

/**
 * Update existing user details in Vault.
 * Uses Axios client configured for Vault.
 */
export async function updateUserDetails(
  data: Partial<UserFormState>
): Promise<UserDetails> {
  const response = await vaultApi.put<UserDetails>("/user", data);
  return response.data;
}
