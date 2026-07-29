import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const french: Record<string, string> = {
  Home: "Accueil",
  Notes: "Notes",
  Maps: "Cartes",
  Calendar: "Calendrier",
  Daily: "Quotidien",
  Training: "Entraînement",
  Projects: "Projets",
  Focus: "Concentration",
  Recap: "Récapitulatif",
  Settings: "Paramètres",
  Search: "Rechercher",
  Today: "Aujourd’hui",
  New: "Nouveau",
  Done: "Terminé",
  General: "Général",
  Appearance: "Apparence",
  Vault: "Coffre",
  Workspaces: "Espaces de travail",
  Editor: "Éditeur",
  Categories: "Catégories",
  "Daily Grid": "Grille quotidienne",
  Shortcuts: "Raccourcis",
  Backup: "Sauvegarde",
  "Import / Export": "Importer / Exporter",
  About: "À propos",
  Preferences: "Préférences",
  Language: "Langue",
  English: "Anglais",
  "Start with Windows": "Démarrer avec Windows",
  "Launch Diorna when you sign in.": "Lancer Diorna à l’ouverture de session.",
  "Portable mode never writes a startup registration.":
    "Le mode portable n’inscrit jamais Diorna au démarrage.",
  "Minimise to tray": "Réduire dans la zone de notification",
  "Keep quick capture available when closing the window.":
    "Garder la capture rapide disponible après la fermeture de la fenêtre.",
  "Default workspace on launch": "Espace de travail au démarrage",
  "Last used workspace": "Dernier espace utilisé",
  "Update channel": "Canal de mise à jour",
  Stable: "Stable",
  Beta: "Bêta",
  "Automatic updates": "Mises à jour automatiques",
  "Disable for a fully manual update workflow.":
    "Désactivez-les pour gérer les mises à jour manuellement.",
  "Portable builds never contact the update service.":
    "Les versions portables ne contactent jamais le service de mise à jour.",
  "Check for updates": "Rechercher des mises à jour",
  "Diorna is up to date.": "Diorna est à jour.",
  "Theme & interface": "Thème et interface",
  "A calm, dense workspace tuned to your display.":
    "Un espace calme et dense, adapté à votre écran.",
  Theme: "Thème",
  diorna: "Diorna",
  light: "clair",
  dark: "sombre",
  system: "système",
  "Accent color": "Couleur d’accentuation",
  Density: "Densité",
  Compact: "Compacte",
  Comfortable: "Confortable",
  "Interface font": "Police de l’interface",
  "Editor font": "Police de l’éditeur",
  "Font size": "Taille de police",
  "Line width": "Largeur de ligne",
  "Vault location": "Emplacement du coffre",
  "Open in Explorer": "Ouvrir dans l’Explorateur",
  "Move vault": "Déplacer le coffre",
  "Re-index": "Réindexer",
  "Storage usage": "Utilisation du stockage",
  Trash: "Corbeille",
  Restore: "Restaurer",
  "Delete permanently": "Supprimer définitivement",
  "Empty trash": "Vider la corbeille",
  "Create workspace": "Créer un espace de travail",
  Rename: "Renommer",
  Delete: "Supprimer",
  Color: "Couleur",
  "Dashboard layout": "Disposition du tableau de bord",
  "Spell check": "Correction orthographique",
  "Spell-check language": "Langue de correction",
  "Auto-pair brackets": "Fermer automatiquement les parenthèses",
  "Tab key": "Touche Tabulation",
  "Default new-note folder": "Dossier par défaut des nouvelles notes",
  "Default template": "Modèle par défaut",
  "Week starts on": "La semaine commence le",
  Monday: "Lundi",
  Sunday: "Dimanche",
  "Visible hours": "Heures visibles",
  "Default duration": "Durée par défaut",
  "Default reminder": "Rappel par défaut",
  "Allow future check-in": "Autoriser les saisies futures",
  "Future days are read-only by default.": "Les jours futurs sont en lecture seule par défaut.",
  "Default window": "Fenêtre par défaut",
  Provider: "Fournisseur",
  "No summariser": "Aucun résumeur",
  "Local Ollama": "Ollama local",
  Model: "Modèle",
  "API key": "Clé API",
  "Save API key": "Enregistrer la clé API",
  "Automatic monthly recap": "Récapitulatif mensuel automatique",
  "Automatic yearly recap": "Récapitulatif annuel automatique",
  "Keyboard shortcuts": "Raccourcis clavier",
  Conflict: "Conflit",
  "Reset shortcuts": "Réinitialiser les raccourcis",
  "Backup location": "Emplacement des sauvegardes",
  Frequency: "Fréquence",
  Weekly: "Hebdomadaire",
  "At launch": "Au démarrage",
  Retention: "Conservation",
  "Back up now": "Sauvegarder maintenant",
  "Restore backup": "Restaurer une sauvegarde",
  "Import Obsidian": "Importer Obsidian",
  "Import Notion": "Importer Notion",
  "Export portable vault": "Exporter le coffre portable",
  Version: "Version",
  Licence: "Licence",
  "Third-party notices": "Mentions des logiciels tiers",
  "Release notes": "Notes de version",
  Repository: "Dépôt",
  "Component library": "Bibliothèque de composants",
  "Choose your vault": "Choisissez votre coffre",
  "Diorna stores everything as files you own. The default is a Diorna folder in Documents.":
    "Diorna stocke tout dans des fichiers qui vous appartiennent. Par défaut, le coffre se trouve dans Documents.",
  "Choose another folder…": "Choisir un autre dossier…",
  "Make it comfortable": "Adaptez l’interface",
  "You can change this any time in Appearance.":
    "Vous pourrez modifier ce choix à tout moment dans Apparence.",
  Light: "Clair",
  Dark: "Sombre",
  System: "Système",
  "Separate your worlds": "Séparez vos univers",
  "Workspaces never leak data into one another.":
    "Les données ne passent jamais d’un espace de travail à un autre.",
  "Study workspace": "Espace d’étude",
  "Personal workspace": "Espace personnel",
  "Ready when you are": "Tout est prêt",
  "You can import an Obsidian or Notion export now or later.":
    "Vous pouvez importer un export Obsidian ou Notion maintenant ou plus tard.",
  Back: "Retour",
  Continue: "Continuer",
  "Enter Diorna": "Entrer dans Diorna",
  "Quick capture": "Capture rapide",
  "Capture a thought without breaking your flow.": "Capturez une idée sans perdre le fil.",
  Save: "Enregistrer",
  Cancel: "Annuler",
  Close: "Fermer",
  Later: "Plus tard",
  "Restart and install": "Redémarrer et installer",
  "Something went wrong": "Une erreur s’est produite",
  "Your files are safe. Copy the diagnostics below when reporting this issue.":
    "Vos fichiers sont en sécurité. Copiez le diagnostic ci-dessous pour signaler le problème.",
  Reload: "Recharger",
  "Copy diagnostics": "Copier le diagnostic",
  "New note": "Nouvelle note",
  "New map": "Nouvelle carte",
  "New task": "Nouvelle tâche",
  "New habit": "Nouvelle habitude",
  "New metric": "Nouvelle mesure",
  "Recently edited": "Modifiés récemment",
  "Today’s completion": "Progression du jour",
  "Agenda and deadlines": "Agenda et échéances",
  Courses: "Cours",
  "Flashcards due": "Cartes à réviser",
  "Active projects": "Projets actifs",
  "Current streaks": "Séries en cours",
  "Monthly recap": "Récapitulatif mensuel",
  "No items yet": "Aucun élément",
  "No results": "Aucun résultat",
  "No notes found": "Aucune note trouvée",
  "No maps yet": "Aucune carte",
  "Create one": "En créer un",
  "All day": "Toute la journée",
  Month: "Mois",
  Week: "Semaine",
  Day: "Jour",
  Agenda: "Agenda",
  "Add task": "Ajouter une tâche",
  "Add event": "Ajouter un événement",
  "Mark complete": "Marquer comme terminé",
  "Mark incomplete": "Marquer comme non terminé",
  "Type / for blocks and [[ to link ideas. Everything saves automatically.":
    "Tapez / pour les blocs et [[ pour lier des idées. Tout est enregistré automatiquement.",
  "Type '/' for blocks, '[[' to link a note…":
    "Tapez « / » pour les blocs, « [[ » pour lier une note…",
  "Search settings": "Rechercher dans les paramètres",
  "Search notes": "Rechercher dans les notes",
  "Search commands and content…": "Rechercher des commandes et du contenu…",
  "Choose file…": "Choisir un fichier…",
  "Add a caption…": "Ajouter une légende…",
  "Use Windows accent color": "Utiliser la couleur d’accentuation Windows",
  "Diorna AI limits": "Limites de Diorna AI",
  "Control how long creation plans may run and how generated Map notes are grouped.":
    "Contrôlez la durée des plans de création et le regroupement des notes générées pour les cartes.",
  "Initial request timeout": "Délai de la requête initiale",
  "Seconds before the first AI request is stopped.":
    "Secondes avant l’arrêt de la première requête IA.",
  "Repair timeout": "Délai de réparation",
  "Used only once when the first structured response is incomplete.":
    "Utilisé une seule fois lorsque la première réponse structurée est incomplète.",
  "AI maximum output tokens": "Nombre maximal de tokens de sortie IA",
  "The repair call uses the same limit. Diorna never retries more than once.":
    "L’appel de réparation utilise la même limite. Diorna ne réessaie jamais plus d’une fois.",
  "Generated Map notes": "Notes générées pour les cartes",
  "Group with tags": "Regrouper avec des tags",
  "Group in a folder": "Regrouper dans un dossier",
  "Use tags and a folder": "Utiliser des tags et un dossier",
  "Generated Map folder": "Dossier des cartes générées",
  "Each generated Map receives its own subfolder.":
    "Chaque carte générée reçoit son propre sous-dossier.",
  "Building your plan": "Création de votre plan",
  "Reading your request and selected notes": "Lecture de votre demande et des notes sélectionnées",
  "Asking Kimi K2.6 for a structured plan": "Demande d’un plan structuré à Kimi K2.6",
  "Checking actions and workspace references": "Vérification des actions et des références",
  "Repairing an incomplete response": "Réparation d’une réponse incomplète",
  "Checking the repaired plan": "Vérification du plan réparé",
  "Review before creating": "Vérifier avant de créer",
  "Review before updating": "Vérifier avant de mettre à jour",
  Assumptions: "Hypothèses",
  "Edit request": "Modifier la demande",
  "Undo this batch": "Annuler ce lot",
  "New request": "Nouvelle demande",
  "Restructure current Map": "Restructurer la carte actuelle",
  "attachments stay in place": "les pièces jointes restent en place",
  "Reference a note": "Référencer une note",
  "No matching note in this workspace.": "Aucune note correspondante dans cet espace.",
  "Review required · Ctrl+Enter to send": "Vérification requise · Ctrl+Entrée pour envoyer",
  "Stop generation": "Arrêter la génération",
  Plan: "Planifier",
  "Progress you can repeat": "Une progression que vous pouvez répéter",
  "Log a session quickly, reuse what worked, and see your progress over time.":
    "Enregistrez rapidement une séance, réutilisez ce qui fonctionne et suivez vos progrès.",
  "Import note": "Importer une note",
  "Start session": "Démarrer une séance",
  Session: "Séance",
  History: "Historique",
  Progress: "Progression",
  Library: "Bibliothèque",
  "Finish session": "Terminer la séance",
  "Set up in seconds": "Configuration en quelques secondes",
  "Create your first activity": "Créez votre première activité",
  "Build a custom activity": "Créer une activité personnalisée",
  Strength: "Musculation",
  Running: "Course",
  Cycling: "Cyclisme",
  Swimming: "Natation",
  "Team sport": "Sport collectif",
  Mobility: "Mobilité",
  Custom: "Personnalisé",
  "Choose your session": "Choisissez votre séance",
  Activity: "Activité",
  "Create a template": "Créer un modèle",
  "Reuse the same structure next time": "Réutilisez la même structure la prochaine fois",
  "Last session": "Dernière séance",
  "Repeat last session": "Répéter la dernière séance",
  "No completed session yet": "Aucune séance terminée",
  "In progress": "En cours",
  "Session note": "Note de séance",
  Previous: "Précédent",
  Load: "Charge",
  Reps: "Répétitions",
  Minutes: "Minutes",
  Distance: "Distance",
  "Add set": "Ajouter une série",
  "Add exercise": "Ajouter un exercice",
  "Completed sessions": "Séances terminées",
  "Measured over time": "Mesuré dans le temps",
  Exercise: "Exercice",
  "Max load": "Charge maximale",
  "Max reps": "Répétitions maximales",
  Volume: "Volume",
  Duration: "Durée",
  "At a glance": "En un coup d’œil",
  Latest: "Dernier résultat",
  "Personal best": "Record personnel",
  "Recorded sessions": "Séances enregistrées",
  "Make Training yours": "Personnalisez Training",
  "Activity library": "Bibliothèque d’activités",
  Activities: "Activités",
  Exercises: "Exercices",
  Templates: "Modèles",
  "Create activity": "Créer l’activité",
  "Create exercise": "Créer l’exercice",
  "Save template": "Enregistrer le modèle",
  "Track completed minutes in Daily": "Suivre les minutes terminées dans Quotidien",
  "Import an old training note": "Importer une ancienne note d’entraînement",
  Preview: "Aperçu",
  "Calendar connection": "Connexion au calendrier",
  "Date and time": "Date et heure",
  "Add to Calendar": "Ajouter au calendrier",
  "Start training": "Démarrer l’entraînement",
  "Open training session": "Ouvrir la séance",
  "Generation stopped. Nothing was created.": "Génération arrêtée. Rien n’a été créé.",
  "Stopping generation…": "Arrêt de la génération…",
  "Add an OpenRouter API key in Settings → Recap first.":
    "Ajoutez d’abord une clé API OpenRouter dans Paramètres → Récapitulatif.",
  "cost pending": "coût en attente",
  "awaiting usage": "utilisation en attente",
};

const resources = {
  en: { translation: Object.fromEntries(Object.keys(french).map((key) => [key, key])) },
  fr: { translation: french },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
let observer: MutationObserver | undefined;

function translated(value: string): string {
  if (i18n.language !== "fr") return value;
  return translatedFrench(value);
}

function translatedFrench(value: string): string {
  const direct = french[value];
  if (direct) return direct;
  return value
    .replace(/^Step (\d+) of (\d+)$/, "Étape $1 sur $2")
    .replace(/^Downloading (.+)$/, "Téléchargement de $1")
    .replace(/^Version (.+) is ready to install\.$/, "La version $1 est prête à être installée.")
    .replace(/^Due (.+)$/, "Échéance : $1")
    .replace(/^Creates in (.+) only\.$/, "Crée uniquement dans $1.")
    .replace(/^Created in (.+)$/, "Créé dans $1")
    .replace(/^Updated in (.+)$/, "Mis à jour dans $1")
    .replace(/^(\d+) provider call$/, "$1 appel fournisseur")
    .replace(/^(\d+) provider calls$/, "$1 appels fournisseur")
    .replace(/^Limit: (.+) output tokens\/call$/, "Limite : $1 tokens de sortie/appel")
    .replace(/^(\d+) open tasks$/, "$1 tâches ouvertes")
    .replace(/^(\d+) days?$/, "$1 jours");
}

function localizeText(node: Text): void {
  if (node.parentElement?.closest("[data-i18n-skip], .prose-editor, pre, code")) return;
  let source = originalText.get(node);
  if (source === undefined) {
    source = node.data;
    originalText.set(node, source);
  } else {
    const expected = replaceTrimmed(source, translated(source.trim()));
    const frenchExpected = replaceTrimmed(source, translatedFrench(source.trim()));
    if (node.data !== expected && node.data !== frenchExpected && node.data !== source) {
      source = node.data;
      originalText.set(node, source);
    }
  }
  const next = replaceTrimmed(source, translated(source.trim()));
  if (node.data !== next) node.data = next;
}

function replaceTrimmed(source: string, value: string): string {
  if (!source.trim()) return source;
  const start = source.match(/^\s*/)?.[0] ?? "";
  const end = source.match(/\s*$/)?.[0] ?? "";
  return `${start}${value}${end}`;
}

function localizeElement(element: Element): void {
  for (const attribute of ["placeholder", "title", "aria-label"]) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    let values = originalAttributes.get(element);
    if (!values) {
      values = new Map();
      originalAttributes.set(element, values);
    }
    const stored = values.get(attribute);
    const source =
      stored &&
      (current === stored || current === translated(stored) || current === translatedFrench(stored))
        ? stored
        : current;
    values.set(attribute, source);
    const next = translated(source);
    if (current !== next) element.setAttribute(attribute, next);
  }
  for (const child of element.childNodes) {
    if (child instanceof Text) localizeText(child);
    else if (child instanceof Element) localizeElement(child);
  }
}

export function installDomLocalization(): () => void {
  observer?.disconnect();
  const run = () => localizeElement(document.documentElement);
  run();
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData" && mutation.target instanceof Text)
        localizeText(mutation.target);
      for (const node of mutation.addedNodes) {
        if (node instanceof Text) localizeText(node);
        else if (node instanceof Element) localizeElement(node);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  i18n.on("languageChanged", run);
  return () => {
    observer?.disconnect();
    i18n.off("languageChanged", run);
  };
}

export default i18n;
