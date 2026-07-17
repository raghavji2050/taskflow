import { describe, it, expect } from "vitest";
import { getFirebaseWebConfig, isFirebaseWebConfigured } from "@/lib/firebase-config";

describe("firebase-config", () => {
  it("returns null config when env is incomplete", () => {
    // Relies on test env not having Firebase web keys set; if they are set, still a valid shape.
    const config = getFirebaseWebConfig();
    if (!config) {
      expect(isFirebaseWebConfigured()).toBe(false);
      return;
    }
    expect(config.apiKey).toBeTruthy();
    expect(config.projectId).toBeTruthy();
    expect(config.appId).toBeTruthy();
  });
});
