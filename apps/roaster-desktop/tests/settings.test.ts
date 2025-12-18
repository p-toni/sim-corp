import { beforeEach, expect, test } from "vitest";
import {
  defaultEndpointSettings,
  getEndpointSettings,
  loadEndpointSettings,
  saveEndpointSettings
} from "../src/lib/settings";

beforeEach(() => {
  localStorage.clear();
});

test("loads default endpoint settings when none are stored", async () => {
  const settings = await loadEndpointSettings();
  expect(settings).toMatchObject(defaultEndpointSettings);
});

test("persists overrides and updates runtime settings", async () => {
  const override = { analyticsUrl: "http://localhost:9999" };
  await saveEndpointSettings(override);
  const loaded = await loadEndpointSettings();
  expect(loaded.analyticsUrl).toBe(override.analyticsUrl);
  expect(getEndpointSettings().analyticsUrl).toBe(override.analyticsUrl);
});
