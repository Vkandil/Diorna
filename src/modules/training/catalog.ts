import type { TrainingActivityKind, TrainingLoadMode, TrainingMeasureType } from "@/shared/models";

export interface TrainingExerciseCatalogEntry {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  activityKinds: TrainingActivityKind[];
  measureType: TrainingMeasureType;
  loadMode: TrainingLoadMode;
  popular?: boolean;
}

type CatalogSeed = [
  name: string,
  aliases: string[],
  category: string,
  activityKinds: TrainingActivityKind[],
  measureType: TrainingMeasureType,
  loadMode: TrainingLoadMode,
  popular?: boolean,
];

const strength = ["strength"] as TrainingActivityKind[];
const running = ["running"] as TrainingActivityKind[];
const cycling = ["cycling"] as TrainingActivityKind[];
const swimming = ["swimming"] as TrainingActivityKind[];
const team = ["team"] as TrainingActivityKind[];
const mobility = ["mobility"] as TrainingActivityKind[];

const seeds: CatalogSeed[] = [
  [
    "Back squat",
    ["squat", "barbell squat", "squat arrière"],
    "Legs",
    strength,
    "sets",
    "external",
    true,
  ],
  ["Front squat", ["squat avant"], "Legs", strength, "sets", "external"],
  ["Goblet squat", ["kettlebell squat"], "Legs", strength, "sets", "external"],
  ["Hack squat", ["machine squat"], "Legs", strength, "sets", "external"],
  ["Box squat", [], "Legs", strength, "sets", "external"],
  ["Pistol squat", ["single leg squat"], "Legs", strength, "sets", "bodyweight-plus"],
  ["Leg press", ["presse à cuisses", "press legs"], "Legs", strength, "sets", "external", true],
  ["Leg extension", ["extension quadriceps"], "Legs", strength, "sets", "external", true],
  ["Leg curl", ["hamstring curl", "curl ischio"], "Legs", strength, "sets", "external", true],
  ["Single-leg curl", ["one leg curl"], "Legs", strength, "sets", "external"],
  [
    "Romanian deadlift",
    ["rdl", "soulevé de terre roumain"],
    "Legs",
    strength,
    "sets",
    "external",
    true,
  ],
  [
    "Deadlift",
    ["conventional deadlift", "soulevé de terre"],
    "Legs",
    strength,
    "sets",
    "external",
    true,
  ],
  ["Sumo deadlift", ["sumo"], "Legs", strength, "sets", "external"],
  ["Hip thrust", ["barbell hip thrust"], "Glutes", strength, "sets", "external", true],
  ["Glute bridge", ["pont fessier"], "Glutes", strength, "sets", "bodyweight-plus"],
  [
    "Bulgarian split squat",
    ["bulgarian squat", "fente bulgare"],
    "Legs",
    strength,
    "sets",
    "external",
    true,
  ],
  ["Walking lunge", ["lunge", "fentes marchées"], "Legs", strength, "sets", "external"],
  ["Reverse lunge", ["fente arrière"], "Legs", strength, "sets", "external"],
  ["Step-up", ["box step up"], "Legs", strength, "sets", "external"],
  ["Good morning", [], "Legs", strength, "sets", "external"],
  ["Nordic curl", ["nordic hamstring curl"], "Legs", strength, "sets", "bodyweight"],
  ["Standing calf raise", ["calf raise", "mollets debout"], "Calves", strength, "sets", "external"],
  ["Seated calf raise", ["mollets assis"], "Calves", strength, "sets", "external"],
  ["Hip abduction", ["abducteur", "abduction machine"], "Glutes", strength, "sets", "external"],
  ["Hip adduction", ["adducteur", "adduction machine"], "Legs", strength, "sets", "external"],
  ["Kettlebell swing", ["kb swing"], "Full body", strength, "sets", "external"],
  [
    "Bench press",
    ["barbell bench press", "développé couché"],
    "Chest",
    strength,
    "sets",
    "external",
    true,
  ],
  [
    "Incline bench press",
    ["incline press", "développé incliné"],
    "Chest",
    strength,
    "sets",
    "external",
    true,
  ],
  ["Decline bench press", ["decline press"], "Chest", strength, "sets", "external"],
  ["Dumbbell bench press", ["db bench press"], "Chest", strength, "sets", "external"],
  ["Chest press", ["machine chest press"], "Chest", strength, "sets", "external"],
  ["Push-up", ["push up", "pompe"], "Chest", strength, "sets", "bodyweight", true],
  [
    "Weighted push-up",
    ["push up lesté", "pompe lestée"],
    "Chest",
    strength,
    "sets",
    "bodyweight-plus",
  ],
  ["Dips", ["dip", "parallel bar dips"], "Chest", strength, "sets", "bodyweight-plus", true],
  ["Cable fly", ["cable crossover", "écarté poulie"], "Chest", strength, "sets", "external"],
  ["Pec deck", ["machine fly"], "Chest", strength, "sets", "external"],
  [
    "Pull-up",
    ["pull up", "traction pronation", "tractions"],
    "Back",
    strength,
    "sets",
    "bodyweight-plus",
    true,
  ],
  ["Chin-up", ["chin up", "traction supination"], "Back", strength, "sets", "bodyweight-plus"],
  [
    "Assisted pull-up",
    ["assisted chin up", "traction assistée"],
    "Back",
    strength,
    "sets",
    "assisted",
  ],
  ["Muscle-up", ["muscle up"], "Full body", strength, "sets", "bodyweight-plus"],
  ["Lat pulldown", ["pulldown", "tirage vertical"], "Back", strength, "sets", "external", true],
  ["Barbell row", ["bent over row", "rowing barre"], "Back", strength, "sets", "external", true],
  ["Dumbbell row", ["one arm row", "rowing haltère"], "Back", strength, "sets", "external"],
  [
    "Seated cable row",
    ["cable row", "tirage horizontal"],
    "Back",
    strength,
    "sets",
    "external",
    true,
  ],
  ["Chest-supported row", ["supported row"], "Back", strength, "sets", "external"],
  ["T-bar row", ["t bar row"], "Back", strength, "sets", "external"],
  ["Inverted row", ["australian pull up"], "Back", strength, "sets", "bodyweight-plus"],
  ["Face pull", ["rope face pull"], "Back", strength, "sets", "external"],
  [
    "Back extension",
    ["hyperextension", "extension lombaire"],
    "Back",
    strength,
    "sets",
    "bodyweight-plus",
  ],
  [
    "Overhead press",
    ["ohp", "military press", "développé militaire"],
    "Shoulders",
    strength,
    "sets",
    "external",
    true,
  ],
  ["Dumbbell shoulder press", ["db shoulder press"], "Shoulders", strength, "sets", "external"],
  ["Arnold press", [], "Shoulders", strength, "sets", "external"],
  ["Lateral raise", ["élévation latérale"], "Shoulders", strength, "sets", "external", true],
  ["Front raise", ["élévation frontale"], "Shoulders", strength, "sets", "external"],
  ["Reverse fly", ["rear delt fly", "oiseau"], "Shoulders", strength, "sets", "external"],
  ["Shrug", ["barbell shrug", "haussement épaules"], "Shoulders", strength, "sets", "external"],
  ["Handstand push-up", ["hspu"], "Shoulders", strength, "sets", "bodyweight"],
  ["Biceps curl", ["barbell curl", "curl biceps"], "Arms", strength, "sets", "external", true],
  ["Dumbbell curl", ["curl haltères"], "Arms", strength, "sets", "external"],
  ["Hammer curl", ["curl marteau"], "Arms", strength, "sets", "external"],
  ["Preacher curl", ["curl pupitre"], "Arms", strength, "sets", "external"],
  ["Cable curl", ["curl poulie"], "Arms", strength, "sets", "external"],
  [
    "Triceps pushdown",
    ["pushdown", "extension triceps poulie"],
    "Arms",
    strength,
    "sets",
    "external",
    true,
  ],
  [
    "Overhead triceps extension",
    ["extension triceps au-dessus tête"],
    "Arms",
    strength,
    "sets",
    "external",
  ],
  [
    "Skull crusher",
    ["lying triceps extension", "barre au front"],
    "Arms",
    strength,
    "sets",
    "external",
  ],
  ["Close-grip bench press", ["close grip bench"], "Arms", strength, "sets", "external"],
  ["Plank", ["planche", "gainage"], "Core", strength, "duration", "none", true],
  ["Side plank", ["planche latérale"], "Core", strength, "duration", "none"],
  ["Crunch", ["abdominal crunch"], "Core", strength, "sets", "bodyweight"],
  ["Sit-up", ["sit up"], "Core", strength, "sets", "bodyweight"],
  [
    "Hanging leg raise",
    ["leg raise", "relevé de jambes suspendu"],
    "Core",
    strength,
    "sets",
    "bodyweight",
  ],
  ["Hanging knee raise", ["knee raise"], "Core", strength, "sets", "bodyweight"],
  ["Ab wheel rollout", ["ab roller", "roue abdominale"], "Core", strength, "sets", "bodyweight"],
  ["Russian twist", ["rotation russe"], "Core", strength, "sets", "bodyweight-plus"],
  ["Mountain climber", ["mountain climbers"], "Core", strength, "duration", "none"],
  ["Burpee", ["burpees"], "Full body", strength, "sets", "bodyweight"],
  ["Clean", ["power clean"], "Olympic", strength, "sets", "external"],
  ["Clean and jerk", ["épaulé jeté"], "Olympic", strength, "sets", "external"],
  ["Snatch", ["arraché"], "Olympic", strength, "sets", "external"],
  [
    "Farmer carry",
    ["farmer walk", "marche du fermier"],
    "Full body",
    strength,
    "mixed",
    "external",
  ],
  ["Easy run", ["jog", "footing"], "Running", running, "mixed", "none", true],
  ["Long run", ["sortie longue"], "Running", running, "mixed", "none", true],
  ["Tempo run", ["threshold run", "seuil"], "Running", running, "mixed", "none"],
  ["Interval run", ["intervals", "fractionné"], "Running", running, "mixed", "none", true],
  ["Sprint", ["sprints"], "Running", running, "mixed", "none"],
  ["Hill repeats", ["hill sprint", "côtes"], "Running", running, "mixed", "none"],
  ["Treadmill run", ["tapis de course"], "Running", running, "mixed", "none"],
  ["Recovery run", ["récupération"], "Running", running, "mixed", "none"],
  ["Outdoor ride", ["bike ride", "sortie vélo"], "Cycling", cycling, "mixed", "none", true],
  ["Indoor cycling", ["home trainer", "spinning"], "Cycling", cycling, "mixed", "none", true],
  ["Cycling intervals", ["bike intervals"], "Cycling", cycling, "mixed", "none"],
  ["Cycling commute", ["bike commute", "vélotaf"], "Cycling", cycling, "mixed", "none"],
  ["Freestyle swim", ["front crawl", "crawl"], "Swimming", swimming, "mixed", "none", true],
  ["Breaststroke", ["brasse"], "Swimming", swimming, "mixed", "none"],
  ["Backstroke", ["dos crawlé"], "Swimming", swimming, "mixed", "none"],
  ["Butterfly", ["papillon"], "Swimming", swimming, "mixed", "none"],
  ["Swimming intervals", ["swim intervals"], "Swimming", swimming, "mixed", "none"],
  ["Match", ["game", "rencontre"], "Team sport", team, "duration", "none", true],
  [
    "Team training",
    ["practice", "entraînement collectif"],
    "Team sport",
    team,
    "duration",
    "none",
    true,
  ],
  ["Technical drills", ["drills", "exercices techniques"], "Team sport", team, "duration", "none"],
  ["Warm-up", ["échauffement"], "Mobility", mobility, "duration", "none", true],
  ["Mobility session", ["mobilité"], "Mobility", mobility, "duration", "none", true],
  ["Full-body stretching", ["stretching", "étirements"], "Mobility", mobility, "duration", "none"],
  ["Yoga", [], "Mobility", mobility, "duration", "none"],
  ["Foam rolling", ["auto massage"], "Mobility", mobility, "duration", "none"],
];

export const TRAINING_EXERCISE_CATALOG: TrainingExerciseCatalogEntry[] = seeds.map(
  ([name, aliases, category, activityKinds, measureType, loadMode, popular]) => ({
    id: normalizeExerciseName(name).replace(/\s+/g, "-"),
    name,
    aliases,
    category,
    activityKinds,
    measureType,
    loadMode,
    ...(popular ? { popular } : {}),
  }),
);

export function normalizeExerciseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

export function searchTrainingExerciseCatalog(
  query: string,
  activityKind: TrainingActivityKind,
  existingNames: string[] = [],
  limit = 8,
): TrainingExerciseCatalogEntry[] {
  const needle = normalizeExerciseName(query);
  const existing = new Set(existingNames.map(normalizeExerciseName));
  return TRAINING_EXERCISE_CATALOG.filter(
    (entry) =>
      !existing.has(normalizeExerciseName(entry.name)) &&
      (activityKind === "custom" || entry.activityKinds.includes(activityKind)),
  )
    .map((entry) => ({ entry, score: catalogScore(entry, needle) }))
    .filter(({ entry, score }) => (needle ? score > 0 : Boolean(entry.popular)))
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(Boolean(right.entry.popular)) - Number(Boolean(left.entry.popular)) ||
        left.entry.name.localeCompare(right.entry.name),
    )
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function findCatalogExercise(name: string): TrainingExerciseCatalogEntry | undefined {
  const normalized = normalizeExerciseName(name);
  return TRAINING_EXERCISE_CATALOG.find(
    (entry) =>
      normalizeExerciseName(entry.name) === normalized ||
      entry.aliases.some((alias) => normalizeExerciseName(alias) === normalized),
  );
}

function catalogScore(entry: TrainingExerciseCatalogEntry, query: string): number {
  if (!query) return entry.popular ? 10 : 0;
  const name = normalizeExerciseName(entry.name);
  const aliases = entry.aliases.map(normalizeExerciseName);
  if (name === query) return 100;
  if (name.startsWith(query)) return 80;
  if (name.split(" ").some((word) => word.startsWith(query))) return 65;
  if (name.includes(query)) return 55;
  if (aliases.some((alias) => alias === query)) return 75;
  if (aliases.some((alias) => alias.startsWith(query))) return 60;
  if (aliases.some((alias) => alias.includes(query))) return 45;
  return 0;
}
