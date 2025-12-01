import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RoastProfile, RoastProfileVersion } from "@sim-corp/schemas";
import { vi } from "vitest";
import { ProfilesPanel } from "../src/components/ProfilesPanel";

const baseProfile: RoastProfile = {
  profileId: "P-1",
  name: "House",
  orgId: "org-1",
  version: 1,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  targets: { targetDropSeconds: 650 },
  source: { kind: "MANUAL" }
};

describe("ProfilesPanel", () => {
  it("renders list and triggers actions", async () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    const onNewVersion = vi.fn();
    const user = userEvent.setup();
    render(
      <ProfilesPanel
        profiles={[baseProfile]}
        selectedProfile={baseProfile}
        versions={[{ profileId: "P-1", version: 1, createdAt: baseProfile.createdAt, snapshot: baseProfile }] as RoastProfileVersion[]}
        filters={{ q: "", tag: "", machineModel: "", includeArchived: false }}
        onRefresh={() => {}}
        onFilterChange={() => {}}
        onSelect={onSelect}
        onCreate={onCreate}
        onNewVersion={onNewVersion}
        onArchiveToggle={() => {}}
        onExport={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /view/i }));
    expect(onSelect).toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText(/search/i), "house");
    await user.click(screen.getByRole("button", { name: /save profile/i }));
    expect(onCreate).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /save new version/i }));
    expect(onNewVersion).toHaveBeenCalled();
  });
});
