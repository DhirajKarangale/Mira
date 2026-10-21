import { vaultService } from "@/services";
import type { UserDetails, UserFormState } from "./types";

export async function fetchUserDetails(): Promise<UserDetails> {
  return vaultService.getUserDetails();
}

export async function saveUserDetails(
  data: Partial<UserFormState>
): Promise<UserDetails> {
  return vaultService.saveUserDetails(data);
}
