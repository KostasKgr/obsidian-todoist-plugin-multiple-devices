import { Notice } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeSettings } from "@/factories/settings";
import { makeTokenStorage } from "@/mocks/token";
import { FeedbackPolicy } from "@/services/feedback";
import { type TokenStorageSetting, useSettingsStore } from "@/settings";

vi.mock("obsidian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("obsidian")>()),
  Notice: vi.fn(),
}));

beforeEach(() => {
  useSettingsStore.setState(makeSettings(), true);
  vi.clearAllMocks();
});

describe.each<TokenStorageSetting>(["secrets", "file"])("feedback policy (%s)", (storage) => {
  it.each([
    { enabled: true, token: null, suppressed: true },
    { enabled: false, token: null, suppressed: false },
    { enabled: true, token: "", suppressed: true },
    { enabled: false, token: "", suppressed: false },
    { enabled: true, token: "configured-token", suppressed: false },
    { enabled: false, token: "configured-token", suppressed: false },
    { enabled: true, token: "invalid-token", suppressed: false },
    { enabled: false, token: "invalid-token", suppressed: false },
  ])("enabled=$enabled token=$token suppresses=$suppressed", async (testCase) => {
    useSettingsStore.setState({ tokenStorage: storage, quietWhenNoToken: testCase.enabled });
    const memory = makeTokenStorage();
    if (testCase.token !== null) {
      memory.secretValues.set("swt-todoist-api-token", testCase.token);
      memory.files.set(".obsidian/todoist-token", testCase.token);
    }
    const policy = new FeedbackPolicy(memory.token);

    expect(await policy.shouldSuppress()).toBe(testCase.suppressed);
    await policy.notice("Test notice", 2000);
    if (testCase.suppressed) {
      expect(Notice).not.toHaveBeenCalled();
    } else {
      expect(Notice).toHaveBeenCalledWith("Test notice", 2000);
    }
  });
});

it("defaults to enabled, including when persisted settings omit the new option", () => {
  const defaults = useSettingsStore.getInitialState();
  useSettingsStore.setState({ ...defaults, tokenStorage: "file" }, true);
  expect(useSettingsStore.getState().quietWhenNoToken).toBe(true);
});

it("re-reads storage rather than suppressing based on stale token presence", async () => {
  const memory = makeTokenStorage();
  const policy = new FeedbackPolicy(memory.token);
  expect(await policy.shouldSuppress()).toBe(true);
  memory.secretValues.set("swt-todoist-api-token", "invalid-token");
  expect(await policy.shouldSuppress()).toBe(false);
  memory.secretValues.delete("swt-todoist-api-token");
  expect(await policy.shouldSuppress()).toBe(true);
});

it("preserves notices and console diagnostics if storage cannot be read", async () => {
  const memory = makeTokenStorage();
  const failure = new Error("Secret storage unavailable");
  memory.secrets.getSecret.mockImplementation(() => {
    throw failure;
  });
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await new FeedbackPolicy(memory.token).notice("Storage warning");
    expect(Notice).toHaveBeenCalledWith("Storage warning", undefined);
    expect(consoleError).toHaveBeenCalledWith("Failed to read API token for quiet mode", failure);
  } finally {
    consoleError.mockRestore();
  }
});

it("does not access token storage when the setting is disabled", async () => {
  useSettingsStore.setState({ quietWhenNoToken: false });
  const memory = makeTokenStorage();
  expect(await new FeedbackPolicy(memory.token).shouldSuppress()).toBe(false);
  expect(memory.secrets.getSecret).not.toHaveBeenCalled();
  expect(memory.adapter.exists).not.toHaveBeenCalled();
});
