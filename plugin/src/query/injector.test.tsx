import { act, cleanup, screen, waitFor } from "@testing-library/react";
import type { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeSettings } from "@/factories/settings";
import { makeTokenStorage } from "@/mocks/token";
import { QueryInjector } from "@/query/injector";
import { useSettingsStore } from "@/settings";
import type { PluginContext } from "@/ui/context";

// Avoid task subscriptions/network; retain actual parsing, error rendering,
// markdown lifecycle, ReactRenderer and its quiet-mode boundary.
vi.mock("@/ui/query/QueryRoot", () => ({
  QueryRoot: ({ warnings }: { warnings: string[] }) => (
    <div data-testid="query-root">{warnings.join("\n")}</div>
  ),
}));

let memory: ReturnType<typeof makeTokenStorage>;
let child: (MarkdownRenderChild & { onload: () => void; onunload: () => void }) | undefined;
let container: HTMLElement;

beforeEach(() => {
  useSettingsStore.setState(makeSettings(), true);
  memory = makeTokenStorage();
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(async () => {
  await act(async () => child?.onunload());
  child = undefined;
  container.remove();
  cleanup();
  vi.restoreAllMocks();
});

const inject = async (source: string) => {
  const plugin = { services: { token: memory.token } } as unknown as ReturnType<
    typeof PluginContext.use
  >;
  const context = {
    sourcePath: "test.md",
    addChild: (renderer: typeof child) => {
      child = renderer;
    },
  } as unknown as MarkdownPostProcessorContext;
  await act(async () => {
    new QueryInjector(plugin).onNewBlock(source, container, context);
    child?.onload();
  });
};

describe("quiet-mode markdown integration", () => {
  it("guards parsed query warnings and restores them when a token is saved", async () => {
    await inject("filter: today\nunknownOption: true");
    await waitFor(() => expect(memory.token.presence.getState().status).toBe("absent"));
    expect(container).toBeEmptyDOMElement();
    await act(async () => memory.token.write("configured-token"));
    expect(screen.getByTestId("query-root")).toHaveTextContent("unknownOption");
  });

  it("guards the separate parsing-error path without losing console diagnostics", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await inject("filter: [");
    expect(consoleError).toHaveBeenCalled();
    await waitFor(() => expect(memory.token.presence.getState().status).toBe("absent"));
    expect(container).toBeEmptyDOMElement();
    await act(async () => useSettingsStore.setState({ quietWhenNoToken: false }));
    expect(container.querySelector(".todoist-query-error")).toBeInTheDocument();
  });
});
