import { vaultService } from "@/services";
import type { UserDetails, UserFormState } from "./types";

/**
 * Retrieve user details from Vault.
 * Uses centralized vaultService (GET /user).
 */
export async function fetchUserDetails(): Promise<UserDetails> {
  return vaultService.getUserDetails();
}

/**
 * Save user details in Vault (create or update).
 * Uses centralized vaultService (POST /user).
 */
export async function saveUserDetails(
  data: Partial<UserFormState>
): Promise<UserDetails> {
  return vaultService.saveUserDetails(data);
}

// Aliases for compatibility
export const addUserDetails = saveUserDetails;
export const updateUserDetails = saveUserDetails;
