import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeSettings } from "@/factories/settings";
import { makeTokenStorage } from "@/mocks/token";
import { FeedbackPolicy } from "@/services/feedback";
import { ModalHandler } from "@/services/modals";
import { useSettingsStore } from "@/settings";
import type { PluginContext } from "@/ui/context";

const modal = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
  instances: [] as Array<{ close: () => void }>,
}));

vi.mock("obsidian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("obsidian")>()),
  Platform: { isMobileApp: false },
  Modal: class {
    containerEl = Object.assign(document.createElement("div"), {
      createDiv(this: HTMLElement) {
        const child = document.createElement("div");
        this.appendChild(child);
        return child;
      },
    });
    contentEl = document.createElement("div");
    titleEl = document.createElement("h2");
    constructor() {
      this.containerEl.append(this.titleEl, this.contentEl);
      modal.instances.push(this);
    }
    open() {
      modal.open();
      document.body.append(this.containerEl);
    }
    close() {
      modal.close();
      this.onClose();
      this.containerEl.remove();
    }
    onClose() {}
  },
}));

// Keep real modal routing, React roots, context providers, policy and storage.
// Only replace the forms, which are unrelated to the suppression decision.
vi.mock("@/ui/createTaskModal", () => ({
  CreateTaskModal: () => <div>Task creation form</div>,
}));
vi.mock("@/ui/onboardingModal", () => ({
  OnboardingModal: () => <div>Token setup form</div>,
}));

let memory: ReturnType<typeof makeTokenStorage>;
let handler: ModalHandler;
const onboarding = { onTokenSubmit: vi.fn(async () => {}) };
const creation = { initialContent: "Task", fileContext: undefined, options: {} };

beforeEach(() => {
  useSettingsStore.setState(makeSettings(), true);
  vi.clearAllMocks();
  memory = makeTokenStorage();
  const plugin = {
    app: {},
    services: { token: memory.token, feedback: new FeedbackPolicy(memory.token) },
  } as unknown as ReturnType<typeof PluginContext.use>;
  handler = new ModalHandler(plugin);
});

afterEach(async () => {
  await act(async () => {
    for (const instance of modal.instances.splice(0)) {
      instance.close();
    }
  });
  cleanup();
});

describe.each(["onboarding", "task"] as const)("automatic %s modal", (kind) => {
  it.each([
    { enabled: true, token: null, opens: false },
    { enabled: false, token: null, opens: true },
    { enabled: true, token: "configured-token", opens: true },
    { enabled: false, token: "configured-token", opens: true },
    { enabled: true, token: "invalid-token", opens: true },
    { enabled: false, token: "invalid-token", opens: true },
  ])("enabled=$enabled token=$token opens=$opens", async (testCase) => {
    useSettingsStore.setState({ quietWhenNoToken: testCase.enabled });
    if (testCase.token !== null) {
      memory.secretValues.set("swt-todoist-api-token", testCase.token);
    }
    await act(async () => {
      if (kind === "onboarding") {
        await handler.onboarding(onboarding);
      } else {
        await handler.taskCreation(creation);
      }
    });
    expect(modal.open).toHaveBeenCalledTimes(testCase.opens ? 1 : 0);
    const form = kind === "onboarding" ? "Token setup form" : "Task creation form";
    if (testCase.opens) {
      expect(screen.getByText(form)).toBeInTheDocument();
    } else {
      expect(screen.queryByText(form)).not.toBeInTheDocument();
    }
  });

  it("closes an already-open automatic modal when quiet mode becomes active", async () => {
    useSettingsStore.setState({ quietWhenNoToken: false });
    await act(async () => {
      if (kind === "onboarding") {
        await handler.onboarding(onboarding);
      } else {
        await handler.taskCreation(creation);
      }
    });
    await act(async () => useSettingsStore.setState({ quietWhenNoToken: true }));
    await waitFor(() => expect(modal.close).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Token setup form")).not.toBeInTheDocument();
    expect(screen.queryByText("Task creation form")).not.toBeInTheDocument();
  });
});

it("explicit token setup bypasses quiet mode and remains open when settings change", async () => {
  await act(async () => handler.onboarding(onboarding, true));
  expect(modal.open).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Token setup form")).toBeInTheDocument();
  await act(async () => {
    useSettingsStore.setState({ quietWhenNoToken: false });
    useSettingsStore.setState({ quietWhenNoToken: true });
    await memory.token.write("");
  });
  expect(modal.close).not.toHaveBeenCalled();
  expect(screen.getByText("Token setup form")).toBeInTheDocument();
});

it("closes task creation if its token is removed", async () => {
  await memory.token.write("configured-token");
  await act(async () => handler.taskCreation(creation));
  expect(screen.getByText("Task creation form")).toBeInTheDocument();
  await act(async () => memory.token.write(""));
  await waitFor(() => expect(modal.close).toHaveBeenCalledTimes(1));
});
