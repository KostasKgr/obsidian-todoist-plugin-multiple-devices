import { beforeEach, describe, expect, it } from "vitest";

import { makeSettings } from "@/factories/settings";
import { makeTokenStorage } from "@/mocks/token";
import { type TokenStorageSetting, useSettingsStore } from "@/settings";

beforeEach(() => {
  useSettingsStore.setState(makeSettings(), true);
});

describe.each<TokenStorageSetting>(["secrets", "file"])("token presence (%s)", (storage) => {
  it("starts unknown and recognizes missing, configured, and cleared tokens", async () => {
    useSettingsStore.setState({ tokenStorage: storage });
    const { token } = makeTokenStorage();
    expect(token.presence.getState().status).toBe("unknown");
    expect(await token.read()).toBeNull();
    expect(token.presence.getState()).toEqual({
      status: "absent",
      storage,
      secretId: "swt-todoist-api-token",
    });

    await token.write("invalid-but-configured-token");
    expect(token.presence.getState().status).toBe("present");
    expect(await token.read()).toBe("invalid-but-configured-token");

    await token.write("");
    expect(token.presence.getState().status).toBe("absent");
    expect(await token.read()).toBeNull();
  });
});

it("uses only the selected storage and secret ID", async () => {
  const memory = makeTokenStorage();
  memory.secretValues.set("swt-todoist-api-token", "secret-token");
  expect(await memory.token.read()).toBe("secret-token");

  useSettingsStore.setState({ tokenStorage: "file" });
  expect(await memory.token.read()).toBeNull();
  expect(memory.token.presence.getState().storage).toBe("file");
  await memory.token.write("file-token");
  expect(memory.adapter.write).toHaveBeenCalledWith(".obsidian/todoist-token", "file-token");

  useSettingsStore.setState({ tokenStorage: "secrets", apiTokenSecretId: "another-secret" });
  expect(await memory.token.read()).toBeNull();
  expect(memory.token.presence.getState().secretId).toBe("another-secret");
  await memory.token.write("other-token");
  expect(memory.secrets.setSecret).toHaveBeenCalledWith("another-secret", "other-token");
  expect(memory.secretValues.get("swt-todoist-api-token")).toBe("secret-token");
});

it("does not publish a stale read after switching storage", async () => {
  useSettingsStore.setState({ tokenStorage: "file" });
  const memory = makeTokenStorage();
  let completeRead: (value: string) => void = () => {};
  memory.adapter.exists.mockResolvedValue(true);
  memory.adapter.read.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        completeRead = resolve;
      }),
  );
  const oldRead = memory.token.read();
  // Let the file read begin, then change storage while it is pending.
  await Promise.resolve();
  useSettingsStore.setState({ tokenStorage: "secrets" });
  await memory.token.read();
  completeRead("old-file-token");
  await oldRead;
  expect(memory.token.presence.getState()).toEqual({
    status: "absent",
    storage: "secrets",
    secretId: "swt-todoist-api-token",
  });
});

it("records read failures as errors, not missing tokens", async () => {
  useSettingsStore.setState({ tokenStorage: "file" });
  const memory = makeTokenStorage();
  const failure = new Error("Cannot read vault");
  memory.adapter.exists.mockRejectedValue(failure);
  await expect(memory.token.read()).rejects.toThrow(failure);
  expect(memory.token.presence.getState().status).toBe("error");
});

it("keeps token migration working before quiet-mode startup checks", async () => {
  const memory = makeTokenStorage();
  memory.files.set(".obsidian/todoist-token", "legacy-token");
  await memory.token.migrateStorage("file", "secrets");
  expect(memory.files.has(".obsidian/todoist-token")).toBe(false);
  expect(await memory.token.read()).toBe("legacy-token");
  expect(memory.token.presence.getState().status).toBe("present");
});
