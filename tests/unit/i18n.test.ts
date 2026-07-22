import { afterEach, describe, expect, it } from "vitest";
import i18n, { installDomLocalization } from "@/i18n";

describe("English and French localisation", () => {
  afterEach(async () => {
    document.body.innerHTML = "";
    await i18n.changeLanguage("en");
  });

  it("translates live text and accessible attributes and restores English", async () => {
    document.body.innerHTML =
      '<main><h1>Settings</h1><input placeholder="Search settings" aria-label="Search settings"></main>';
    const dispose = installDomLocalization();
    await i18n.changeLanguage("fr");
    expect(document.querySelector("h1")).toHaveTextContent("Paramètres");
    expect(document.querySelector("input")).toHaveAttribute(
      "placeholder",
      "Rechercher dans les paramètres",
    );
    await i18n.changeLanguage("en");
    expect(document.querySelector("h1")).toHaveTextContent("Settings");
    dispose();
  });

  it("localises parameterised status messages", async () => {
    document.body.innerHTML = "<p>Step 3 of 4</p>";
    const dispose = installDomLocalization();
    await i18n.changeLanguage("fr");
    expect(document.querySelector("p")).toHaveTextContent("Étape 3 sur 4");
    dispose();
  });
});
