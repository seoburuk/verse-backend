// authStore.ts — localStorage 키 상수. 상태는 AuthContext에서 관리.
export const USER_KEY = "kjv_user";

export interface StoredUser {
  user_id: number;
  username?: string;
  display_name: string;
  theme?: string;
  language?: string;
  created_at?: string;
}
