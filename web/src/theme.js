// The theme follows the system: data-theme on <html> (tokens.css), kept in step
// when the system switches between light and dark.
export function followSystemTheme() {
  const dark = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => { document.documentElement.dataset.theme = dark.matches ? "dark" : "light"; };
  apply();
  dark.addEventListener("change", apply);
}
