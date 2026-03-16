export function isLoggedIn() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("tttracker_logged_in") === "true";
}

export function login() {
  localStorage.setItem("tttracker_logged_in", "true");
}

export function logout() {
  localStorage.removeItem("tttracker_logged_in");
}