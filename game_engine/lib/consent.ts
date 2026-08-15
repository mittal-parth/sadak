export const COOKIE_NOTICE_STORAGE_KEY = "sadak.cookieNoticeAcknowledged";

export function hasAcknowledgedCookieNotice(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(COOKIE_NOTICE_STORAGE_KEY) === "1";
  } catch {
    /* private mode / blocked storage */
    return true;
  }
}

export function acknowledgeCookieNotice(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COOKIE_NOTICE_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}
