import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeSettings } from "@/factories/settings";
import { makeTokenStorage } from "@/mocks/token";
import { useSettingsStore } from "@/settings";
import { PluginContext } from "@/ui/context";
import { QuietBoundary } from "@/ui/QuietBoundary";
import { QueryError } from "@/ui/query/QueryError";
import { QueryWarnings } from "@/ui/query/QueryWarnings";

let memory: ReturnType<typeof makeTokenStorage>;

beforeEach(() => {
  useSettingsStore.setState(makeSettings(), true);
  memory = makeTokenStorage();
});

afterEach(cleanup);

const renderQueryFeedback = () => {
  const plugin = { services: { token: memory.token } } as unknown as ReturnType<
    typeof PluginContext.use
  >;
  return render(
    <PluginContext.Provider value={plugin}>
      <QuietBoundary>
        <QueryError error={new Error("Malformed query")} />
        <QueryWarnings warnings={["Query warning"]} />
      </QuietBoundary>
    </PluginContext.Provider>,
  );
};

describe("quiet query boundary", () => {
  it("hides query errors and warnings without flashing them while checking storage", async () => {
    const { container } = renderQueryFeedback();
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(memory.token.presence.getState().status).toBe("absent"));
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    "valid-token",
    "invalid-token",
  ])("shows feedback with a configured %s", async (token) => {
    memory.secretValues.set("swt-todoist-api-token", token);
    renderQueryFeedback();
    expect(await screen.findByText("Malformed query")).toBeInTheDocument();
    expect(screen.getByText("Query warning")).toBeInTheDocument();
  });

  it("reacts to disabling and re-enabling the setting without reloading", async () => {
    renderQueryFeedback();
    await waitFor(() => expect(memory.token.presence.getState().status).toBe("absent"));
    act(() => useSettingsStore.setState({ quietWhenNoToken: false }));
    expect(await screen.findByText("Query warning")).toBeInTheDocument();
    act(() => useSettingsStore.setState({ quietWhenNoToken: true }));
    await waitFor(() => expect(screen.queryByText("Query warning")).not.toBeInTheDocument());
  });

  it("reacts to saving and clearing the token", async () => {
    renderQueryFeedback();
    await waitFor(() => expect(memory.token.presence.getState().status).toBe("absent"));
    await act(async () => memory.token.write("configured-token"));
    expect(screen.getByText("Malformed query")).toBeInTheDocument();
    await act(async () => memory.token.write(""));
    expect(screen.queryByText("Malformed query")).not.toBeInTheDocument();
  });

  it("re-checks token presence when switching storage and secret IDs", async () => {
    memory.secretValues.set("swt-todoist-api-token", "configured-token");
    renderQueryFeedback();
    await screen.findByText("Query warning");

    act(() => useSettingsStore.setState({ tokenStorage: "file" }));
    await waitFor(() => expect(memory.token.presence.getState().storage).toBe("file"));
    expect(screen.queryByText("Query warning")).not.toBeInTheDocument();

    act(() => useSettingsStore.setState({ tokenStorage: "secrets", apiTokenSecretId: "other" }));
    await waitFor(() => expect(memory.token.presence.getState().secretId).toBe("other"));
    expect(screen.queryByText("Query warning")).not.toBeInTheDocument();
    await act(async () => memory.token.write("other-token"));
    expect(screen.getByText("Query warning")).toBeInTheDocument();
  });

  it("notices external token changes on window refocus and removes its listener on unmount", async () => {
    const { unmount } = renderQueryFeedback();
    await waitFor(() => expect(memory.token.presence.getState().status).toBe("absent"));
    memory.secretValues.set("swt-todoist-api-token", "external-token");
    fireEvent.focus(window);
    await screen.findByText("Query warning");

    memory.secretValues.delete("swt-todoist-api-token");
    fireEvent.focus(window);
    await waitFor(() => expect(screen.queryByText("Query warning")).not.toBeInTheDocument());
    unmount();
    const reads = memory.secrets.getSecret.mock.calls.length;
    fireEvent.focus(window);
    expect(memory.secrets.getSecret).toHaveBeenCalledTimes(reads);
  });

  it("does not hide diagnostics when token storage fails", async () => {
    const failure = new Error("Storage unavailable");
    memory.secrets.getSecret.mockImplementation(() => {
      throw failure;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      renderQueryFeedback();
      expect(await screen.findByText("Malformed query")).toBeInTheDocument();
      expect(consoleError).toHaveBeenCalledWith("Failed to refresh API token presence", failure);
    } finally {
      consoleError.mockRestore();
    }
  });
});
