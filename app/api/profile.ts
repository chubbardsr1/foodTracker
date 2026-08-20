const profiles = new Set(["chris", "sarah"]);

export function profileFrom(request: Request) {
  const requested = request.headers.get("x-food-tracker-profile")?.trim().toLowerCase();
  if (requested && profiles.has(requested)) return requested;
  return "chris";
}
