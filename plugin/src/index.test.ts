import type { App, PluginManifest } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeSettings } from "@/factories/settings";
import TodoistPlugin from "@/index";
import { makeTokenStorage } from "@/mocks/token";
import { useSettingsStore } from "@/settings";

const host = vi.hoisted(() => ({
  persisted: {} as Record<string, unknown>,
  saveData: vi.fn(async () => {}),
  modalOpen: vi.fn(),
  initialize: vi.fn(async () => {}),
  sync: vi.fn(async () => {}),
  apiTokens: [] as string[],
  intervals: [] as number[],
}));

vi.mock("obsidian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("obsidian")>()),
  Platform: { isMobileApp: false },
  Plugin: class {
    app: App;
    constructor(app: App) {
      this.app = app;
    }
    loadData() {
      return Promise.resolve(host.persisted);
    }
    saveData = host.saveData;
    registerMarkdownCodeBlockProcessor() {}
    addSettingTab() {}
    registerInterval(id: number) {
      host.intervals.push(id);
    }
  },
  Modal: class {
    titleEl = document.createElement("h2");
    contentEl = document.createElement("div");
    containerEl = {
      createDiv: () => document.createElement("div"),
    };
    open = host.modalOpen;
  },
}));

// Keep the plugin lifecycle, options loading, migration, token storage,
// FeedbackPolicy and ModalHandler real. Replace only unrelated host/network/UI APIs.
vi.mock("@/commands", () => ({ registerCommands: vi.fn() }));
vi.mock("@/query/injector", () => ({
  QueryInjector: class {
    onNewBlock() {}
  },
}));
vi.mock("@/ui/settings", () => ({ SettingsTab: class {} }));
vi.mock("@/ui/createTaskModal", () => ({ CreateTaskModal: () => null }));
vi.mock("@/ui/onboardingModal", () => ({ OnboardingModal: () => null }));
vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: vi.fn(), unmount: vi.fn() }),
}));
vi.mock("@/data", () => ({
  TodoistAdapter: class {
    initialize = host.initialize;
    sync = host.sync;
  },
}));
vi.mock("@/api", () => ({
  TodoistApiClient: class {
    constructor(token: string) {
      host.apiTokens.push(token);
    }
  },
}));
vi.mock("@/api/fetcher", () => ({ ObsidianFetcher: class {} }));

beforeEach(() => {
  vi.clearAllMocks();
  host.persisted = {};
  host.apiTokens.length = 0;
  useSettingsStore.setState(makeSettings(), true);
});
afterEach(() => {
  for (const id of host.intervals.splice(0)) {
    window.clearInterval(id);
  }
});

const startPlugin = async (memory = makeTokenStorage()) => {
  const onLayoutReady = vi.fn();
  const app = {
    vault: memory.vault,
    secretStorage: memory.secrets,
    workspace: { onLayoutReady },
  } as unknown as App;
  const plugin = new TodoistPlugin(app, {} as PluginManifest);
  await plugin.onload();
  const ready = onLayoutReady.mock.calls[0][0] as () => Promise<void>;
  await ready();
  return plugin;
};

describe("quiet-mode startup", () => {
  it("inherits the enabled default from old settings and never prompts without a token", async () => {
    host.persisted = { version: 1, tokenStorage: "secrets" };
    await startPlugin();
    expect(useSettingsStore.getState().quietWhenNoToken).toBe(true);
    expect(host.saveData).toHaveBeenCalledWith(expect.objectContaining({ quietWhenNoToken: true }));
    expect(host.modalOpen).not.toHaveBeenCalled();
    expect(host.initialize).not.toHaveBeenCalled();
    expect(host.apiTokens).toEqual([]);
  });

  it("restores automatic onboarding when quiet mode is disabled", async () => {
    host.persisted = { version: 1, quietWhenNoToken: false };
    await startPlugin();
    expect(host.modalOpen).toHaveBeenCalledTimes(1);
    expect(host.initialize).not.toHaveBeenCalled();
  });

  it.each([
    true,
    false,
  ])("initializes a configured token regardless of quiet mode (%s)", async (enabled) => {
    host.persisted = { version: 1, quietWhenNoToken: enabled };
    const memory = makeTokenStorage();
    memory.secretValues.set("swt-todoist-api-token", "invalid-but-configured-token");
    await startPlugin(memory);
    expect(host.apiTokens).toEqual(["invalid-but-configured-token"]);
    expect(host.initialize).toHaveBeenCalledTimes(1);
    expect(host.modalOpen).not.toHaveBeenCalled();
  });

  it("migrates a legacy file token before deciding whether to stay quiet", async () => {
    const memory = makeTokenStorage();
    memory.files.set(".obsidian/todoist-token", "legacy-token");
    await startPlugin(memory);
    expect(memory.secretValues.get("swt-todoist-api-token")).toBe("legacy-token");
    expect(useSettingsStore.getState().version).toBe(1);
    expect(host.apiTokens).toEqual(["legacy-token"]);
    expect(host.initialize).toHaveBeenCalledTimes(1);
    expect(host.modalOpen).not.toHaveBeenCalled();
  });

  it("loads a token from the selected file storage", async () => {
    host.persisted = { version: 1, tokenStorage: "file" };
    const memory = makeTokenStorage();
    memory.files.set(".obsidian/todoist-token", "file-token");
    await startPlugin(memory);
    expect(host.apiTokens).toEqual(["file-token"]);
    expect(host.modalOpen).not.toHaveBeenCalled();
  });
});
