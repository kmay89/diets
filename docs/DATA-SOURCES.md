# Where the numbers come from

Every nutrition figure in this app is traceable to a public source. Nothing is invented, and where
a value is an estimate it is labelled as one.

## Nutrient values

`data/ingredients.json` stores per-100 g values for each ingredient in this fixed order:

```
kcal, protein_g, fat_g, satfat_g, carb_g, fiber_g,
sugar_g, sodium_mg, potassium_mg, cholesterol_mg, calcium_mg, iron_mg
```

**Source: [USDA FoodData Central](https://fdc.nal.usda.gov/)** — Foundation Foods, SR Legacy, and
the FNDDS survey database, published by the U.S. Department of Agriculture, Agricultural Research
Service. FoodData Central data is in the **public domain** and carries no attribution requirement;
it is cited here because knowing the provenance of a sodium figure matters.

Values are rounded to one decimal place and describe the **raw, as-purchased edible portion** unless
the ingredient name says otherwise ("Brown lentils (dry)", "Chickpeas, canned no-salt-added").

### Where they are approximations

- **Branded and composite items** — jarred marinara, chicken sausage, curry paste, gochujang,
  za'atar, everything bagel seasoning, nutritional yeast — vary enormously between brands. These use
  a representative mid-market label, and any of them can be off by a factor of two on sodium. Read
  the label on the jar in your hand; that is the number that matters.
- **"No salt added" canned goods** are entered at their no-salt-added sodium. If you buy the regular
  version instead, add roughly 200–250 mg of sodium per half cup, less about 40% if you rinse them.
- **Cooking losses and gains** are not modelled. Dry grains and legumes are entered dry, at their
  dry weight and dry nutrient density, which is how the recipes measure them. Water absorbed in
  cooking changes weight but not the nutrients delivered.
- **Salt added to pasta water** is not counted. Most of it goes down the drain; how much stays is
  unknowable from a recipe. Assume a modest amount is unaccounted for in any recipe that boils
  something in salted water.
- **Spices** are estimates where FoodData Central coverage is thin. They contribute a rounding error
  in calories; the one that genuinely matters is salt, which is exact.

The build's `npm run verify` runs an Atwater cross-check on every ingredient — protein × 4 + fat × 9
+ (carb − 55% of fiber) × 4 against the stated calories — and warns when they disagree by more than
28%. Four ingredients legitimately fail it: baking powder and baking soda (mineral content),
vanilla extract and white wine (alcohol calories, which Atwater's 4/9/4 does not include).

## Energy needs

- **Adults (18+):** the **Mifflin-St Jeor** equation, multiplied by a standard activity factor
  (1.2 sedentary → 1.9 athlete). Mifflin MD, St Jeor ST, et al., *A new predictive equation for
  resting energy expenditure in healthy individuals*, Am J Clin Nutr, 1990. It is the equation the
  Academy of Nutrition and Dietetics recommends for non-obese and obese adults alike, and it is
  typically within about 10% for an individual — an estimate, not a measurement.
- **Children and teens (under 18):** the **Dietary Guidelines for Americans 2020–2025**, Appendix 2
  estimated calorie needs by age, sex and activity level. Height and weight are rarely known
  precisely enough for children, and growth makes the adult equations unreliable.
- Weight-loss goals subtract 500 kcal/day but never go below 1,200 kcal (women) or 1,500 (men), and
  never reduce a child's estimate.

## Dietary targets

Heart-forward mode uses the tighter figures from the **American Heart Association**:

| Target | Value | Source |
|---|---|---|
| Sodium | 1,500 mg/day ideal; 2,300 mg upper limit | AHA sodium recommendation; DGA 2020–2025 |
| Saturated fat | under 6% of calories | AHA 2021 Dietary Guidance for Cardiovascular Health |
| Fiber | 14 g per 1,000 kcal | Institute of Medicine / DGA |
| Cholesterol | under 200 mg/day in heart mode | Common clinical guidance for existing CVD |
| Potassium | 2,600 mg (women) / 3,400 mg (men) | National Academies adequate intake |
| Sodium, children | 1,500 mg (4–8), 1,800 mg (9–13), 2,300 mg (14+) | DGA 2020–2025 |

With heart mode off, sodium relaxes to 2,300 mg and saturated fat to 10% of calories — the general
population figures.

## The heart-forward score

**This is our own heuristic, not a published index.** It exists to sort a list of recipes, and it
shows its arithmetic on every recipe screen so you can disagree with it.

Starting from 70, per serving:

| Component | Effect |
|---|---|
| Sodium | −1 point per 12 mg above a calorie-scaled 500 mg allowance, capped at −30 |
| Saturated fat | −2.5 points per percentage point above 6% of calories, capped at −25 |
| Cholesterol | −1 point per 12 mg above 150 mg (about one egg), capped at −12 |
| Fiber | ±1 point per g/1,000 kcal away from 14, clamped to ±15 |
| Potassium:sodium ratio | +5 points per unit above 1.0, clamped −10/+12 |

Clamped to 0–100. A/B/C/D/F bands at 85/72/58/45.

The sodium and cholesterol allowances scale with the size of the serving so a 350 kcal breakfast is
not judged against a 700 kcal dinner's budget. Sides, sauces, snacks and components are **not
scored at all** — grading a vinaigrette against a meal's sodium budget tells you nothing useful, so
those show density flags instead.

Deliberate limitations: it says nothing about added sugar, refined grains, ultra-processing,
omega-3s, or the overall dietary pattern — all of which matter more to cardiovascular outcomes than
any single plate. Treat a letter as "worth a look", never as a verdict.

## Recipes

All 44 recipes are **ERRERLabs originals**, written for this project. A few name a traditional dish
they descend from (pasta e ceci, shakshuka, romesco, dal) — those are culinary traditions, not
copied recipes, and the quantities, methods and text are ours.

## Garden data

`data/garden.json` is calibrated for **USDA hardiness zone 6a/6b** — Hudson, Summit County, Ohio.
Frost dates are averages from NOAA climate normals for Northeast Ohio: last frost roughly May 10–15,
first frost roughly October 10–15, about a 150-day growing season. Planting windows follow standard
OSU Extension guidance for the region. Averages are not promises; a late frost in the third week of
May happens here roughly one year in four.

## Store layouts

`data/aisles.json` uses the standard US supermarket perimeter-first ordering. The named layouts for
Heinen's, Giant Eagle, Acme Fresh Market and Aldi are practical approximations from how those stores
are generally arranged in Northeast Ohio, not official floor plans. Reorder them to match your store.

## Corrections

If a number here is wrong, that is a bug worth reporting. Open an issue with the ingredient id, the
value you believe is correct, and the FoodData Central FDC ID or other public source.
