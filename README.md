# Daily Food Tracker

Mobile-first food diary for recording meals and tracking calories, protein,
fat, total carbohydrates, fiber, and net carbohydrates.

## Current features

- Separate breakfast, lunch, dinner, and snack entries
- USDA FoodData Central search
- Manual nutrition-label entry
- Editable calorie and macro goals
- Automatic net-carb calculation
- Date-by-date history
- Per-user data ownership when authenticated user headers are available
- Installable iPhone Home Screen experience
- Cloudflare D1 storage with Drizzle migrations

## Technology

- TypeScript
- React 19
- Vinext/Next-compatible application routes
- Cloudflare Workers and D1
- Drizzle ORM
- USDA FoodData Central API

## Open on a Windows computer

The hosted application is already deployed. This source package is for keeping
and editing your own copy.

1. Extract the ZIP into a normal project directory.
2. Open the extracted folder in Visual Studio Code.
3. Use WSL with Node.js 22.13 or newer for the included project scripts.
4. In the WSL terminal, run:

   ```bash
   npm ci
   npm run dev
   ```

The production database is supplied by the hosting platform. Local development
uses the binding behavior configured in `vite.config.ts`.

## Database

The schema is in `db/schema.ts`. Generated SQL migrations are in `drizzle/`.
Food entries are assigned to the authenticated user's email, so two authenticated
people receive separate diaries.

## Planned next phase

- Dedicated drinks/beverages category
- Water intake buttons and daily water goal
- Separate access for Chris and Sarah
- Saved foods, favorite meals, and recent foods
- Conversational AI entry
- Barcode and nutrition-label scanning

Do not place private USDA or AI API keys directly in source files. Store future
keys as hosting environment secrets.
