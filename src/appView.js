export function resolveAppView(pathname = "/") {
  if (/^\/presenter\/?$/.test(pathname)) return "presenter";
  if (/^\/report\/?$/.test(pathname)) return "report";
  return "checklist";
}
