import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      Home: "Home",
      Notes: "Notes",
      Maps: "Maps",
      Calendar: "Calendar",
      Daily: "Daily",
      Recap: "Recap",
      Settings: "Settings",
      Search: "Search",
      Today: "Today",
      New: "New",
      Done: "Done",
    },
  },
  fr: {
    translation: {
      Home: "Accueil",
      Notes: "Notes",
      Maps: "Cartes",
      Calendar: "Calendrier",
      Daily: "Quotidien",
      Recap: "Récapitulatif",
      Settings: "Paramètres",
      Search: "Rechercher",
      Today: "Aujourd’hui",
      New: "Nouveau",
      Done: "Terminé",
    },
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
export default i18n;
