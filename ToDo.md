| Original request                            | Status   | What exists now                                                                                                                     |
| ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Browser-based site instead of an iPhone app | Complete | Runs as a website and can be opened from an iPhone browser.                                                                         |
| No Python server                            | Complete | Uses React/Vinext with Cloudflare Workers and D1.                                                                                   |
| Free hosting and services                   | Complete | Cloudflare Workers, D1, Zero Trust Free, and the USDA food API are being used at $0 per month.                                      |
| No monthly hosting charge                   | Complete | The current services are on free plans. Cloudflare Zero Trust required a payment method but currently costs $0 per month.           |
| Daily food diary                            | Complete | Food can be entered under Breakfast, Lunch, Dinner, and Snacks.                                                                     |
| Nutrition details automatically supplied    | Partial  | USDA search and barcode scanning supply calories, protein, fat, carbs, and fiber. Packaged products use their label serving when Open Food Facts has one. |
| AI-assisted food entry                      | Complete | The Add Food form takes a typed or dictated meal description and asks Google Gemini for a nutrition estimate, which is reviewed and edited before it is added. |
| Manually enter foods                        | Complete | You can enter all nutrition values yourself.                                                                                        |
| Remember custom foods                       | Complete | Manually entered foods can be saved under “My Foods” and reused. The Add Food form filters them with a searchable type-ahead list. |
| Daily calorie tracking                      | Complete | Main screen shows consumed calories, goal, remaining calories, and over-goal status. The Calendar scores each day against the goal saved for that day. |
| Net-carbohydrate tracking                   | Complete | Calculated as total carbohydrates minus fiber.                                                                                      |
| Protein and fat tracking                    | Complete | Both appear in daily progress totals.                                                                                               |
| Fiber tracking                              | Complete | Fiber is stored with food entries and shown on the main screen with a customizable daily goal.                                      |
| Multiple people—Chris and Sarah             | Complete | Each profile has separate food, goals, water, and saved foods.                                                                      |
| Lightweight security                        | Complete | Cloudflare Access permits only Chris’s and Sarah’s authorized email addresses.                                                      |
| Water tracking                              | Complete | Separate water section with three shortcut buttons plus `+Other`. Each profile sets its own shortcut amounts in Settings, defaulting to 6, 8, and 12 ounces. |
| Drinks other than water                     | Partial  | Drinks containing calories can be entered as food, but there is no dedicated “Drinks” meal/category.                                |
| Exercise tracking on the main screen        | Complete | Tracks activity, minutes, optional calories burned, daily history, and separate Chris/Sarah records.                                |
| Put the site online                         | Complete | The application and D1 database are live on Cloudflare Workers.                                                                     |
| Restrict the live site to Chris and Sarah   | Complete | Cloudflare Access requires an email login code and allows only the two authorized email addresses.                                  |

- Add in ability to track weight loss

- Calendar: a month grid colours each day against the calorie goal that was
  saved for that day - green under, yellow over, red more than 500 over, grey
  when nothing was logged - with a dot for whether movement was tracked. The
  calorie goal is frozen onto a day the first time anything is recorded for
  it, so lowering the goal later never changes how past days are scored. Any
  day's goal can be corrected by hand.

- Meal assistant: the Add Food form takes a typed or dictated meal
  description and returns a Gemini nutrition estimate for the whole meal as
  one serving, with assumptions, confidence, and warnings shown for review.
  It is added to the diary only, unless "Save to My Foods" is ticked.

- Barcode scanning: the Add Food form can scan a UPC/EAN with the camera or
  take a typed barcode, then look the product up through Open Food Facts and
  pre-fill the form for review. Products that are missing, incomplete, or
  only carry per-100-gram values are handled explicitly, and scanned products
  can be saved to My Foods with their barcode.

- Reports: a Reports section now shows calories consumed and recorded
  movement for a chosen date range, defaulting to the last seven calendar
  days including today. It lists every date in the range, including days with
  no entries, and keeps Chris's and Sarah's data separate.

The major unfinished pieces are:

1. Improve USDA serving-size selection and nutrition scaling.
2. Optionally add a dedicated Drinks category rather than entering caloric drinks as food.
3. Add weight-loss tracking.

Every item from the original vision is now in place. Food can be added by
hand, from a saved food, from USDA search, from a scanned barcode, or from an
AI estimate of a described meal.
