import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeSettings } from "@/factories/settings";
import { t } from "@/i18n";
import { makeTokenStorage } from "@/mocks/token";
import { useSettingsStore } from "@/settings";
import { PluginContext } from "@/ui/context";
import { LabelsControl } from "@/ui/settings/LabelsControl";
import { ProjectDropdownControl } from "@/ui/settings/ProjectDropdownControl";
import { TokenChecker } from "@/ui/settings/TokenChecker";

let memory: ReturnType<typeof makeTokenStorage>;
const tester = vi.fn(async () => false);
const onboarding = vi.fn();
const initialize = vi.fn(async () => {});

beforeEach(() => {
  useSettingsStore.setState(makeSettings(), true);
  vi.clearAllMocks();
  memory = makeTokenStorage();
});
afterEach(cleanup);

const renderSettingsControls = () => {
  const plugin = {
    services: {
      token: memory.token,
      modals: { onboarding },
      todoist: {
        isReady: () => false,
        initialize,
      },
    },
  } as unknown as ReturnType<typeof PluginContext.use>;
  return render(
    <PluginContext.Provider value={plugin}>
      <TokenChecker tester={tester} />
      <ProjectDropdownControl
        value={{ projectId: "missing", projectName: "Saved project" }}
        onChange={vi.fn()}
      />
      <LabelsControl
        value={[{ labelId: "missing", labelName: "Saved label" }]}
        onChange={vi.fn()}
      />
    </PluginContext.Provider>,
  );
};

describe("settings warnings in quiet mode", () => {
  it.each([
    { enabled: true, token: null, warns: false },
    { enabled: false, token: null, warns: true },
    { enabled: true, token: "invalid-token", warns: true },
    { enabled: false, token: "invalid-token", warns: true },
  ])("enabled=$enabled token=$token warns=$warns", async (testCase) => {
    useSettingsStore.setState({ quietWhenNoToken: testCase.enabled });
    if (testCase.token !== null) {
      memory.secretValues.set("swt-todoist-api-token", testCase.token);
    }
    const { container } = renderSettingsControls();
    await waitFor(() => expect(screen.getByRole("button", { name: "Setup" })).toBeEnabled());
    await waitFor(() => {
      expect(container.querySelector(".token-validation-error") !== null).toBe(testCase.warns);
      expect(container.querySelector(".project-dropdown-warning-icon") !== null).toBe(
        testCase.warns,
      );
      expect(container.querySelector(".labels-control-item.is-deleted") !== null).toBe(
        testCase.warns,
      );
    });
    const projectSuffix = testCase.warns
      ? ` (${t().settings.taskCreation.defaultProject.deleted})`
      : "";
    const labelSuffix = testCase.warns
      ? ` (${t().settings.taskCreation.defaultLabels.deleted})`
      : "";
    expect(screen.getByText(`Saved project${projectSuffix}`)).toBeInTheDocument();
    expect(screen.getByText(`Saved label${labelSuffix}`)).toBeInTheDocument();
    if (testCase.token === null) {
      expect(tester).not.toHaveBeenCalled();
    } else {
      expect(tester).toHaveBeenCalledWith(testCase.token);
    }
  });

  it("explicit Setup bypasses suppression, saves the token, and initializes the client", async () => {
    renderSettingsControls();
    const setup = screen.getByRole("button", { name: "Setup" });
    await waitFor(() => expect(setup).toBeEnabled());
    fireEvent.click(setup);
    expect(onboarding).toHaveBeenCalledWith({ onTokenSubmit: expect.any(Function) }, true);
    const { onTokenSubmit } = onboarding.mock.calls[0][0];
    await act(async () => onTokenSubmit("new-token"));
    expect(memory.secretValues.get("swt-todoist-api-token")).toBe("new-token");
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(tester).toHaveBeenCalledWith("new-token");
  });

  it("restores missing-data warnings when quiet mode is disabled live", async () => {
    const { container } = renderSettingsControls();
    await waitFor(() => expect(memory.token.presence.getState().status).toBe("absent"));
    expect(container.querySelector(".labels-control-item.is-deleted")).toBeNull();
    act(() => useSettingsStore.setState({ quietWhenNoToken: false }));
    await waitFor(() =>
      expect(container.querySelector(".labels-control-item.is-deleted")).not.toBeNull(),
    );
    expect(container.querySelector(".project-dropdown-warning-icon")).not.toBeNull();
  });
});
