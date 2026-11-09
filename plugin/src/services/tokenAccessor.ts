import type { SecretStorage, Vault } from "obsidian";
import { createStore } from "zustand/vanilla";

import type { TokenStorageSetting } from "@/settings";
import { useSettingsStore } from "@/settings";

export class VaultTokenAccessor {
  public readonly presence = createStore<{
    status: "unknown" | "absent" | "present" | "error";
    storage: TokenStorageSetting | undefined;
    secretId: string | undefined;
  }>(() => ({ status: "unknown", storage: undefined, secretId: undefined }));

  private readonly secrets: SecretStorage;
  private readonly vault: Vault;
  private readonly path: string;

  constructor(vault: Vault, secrets: SecretStorage) {
    this.secrets = secrets;
    this.vault = vault;
    this.path = `${vault.configDir}/todoist-token`;
  }

  async read(): Promise<string | null> {
    const settings = useSettingsStore.getState();
    let token: string | null;
    try {
      token = await this.readFromStorage(settings.tokenStorage);
    } catch (error) {
      this.presence.setState({
        status: "error",
        storage: settings.tokenStorage,
        secretId: settings.apiTokenSecretId,
      });
      throw error;
    }
    const current = useSettingsStore.getState();
    if (
      current.tokenStorage === settings.tokenStorage &&
      current.apiTokenSecretId === settings.apiTokenSecretId
    ) {
      this.presence.setState({
        status: token === null ? "absent" : "present",
        storage: settings.tokenStorage,
        secretId: settings.apiTokenSecretId,
      });
    }
    return token;
  }

  async write(token: string): Promise<void> {
    const settings = useSettingsStore.getState();
    await this.writeToStorage(token, settings.tokenStorage);
    await this.read();
  }

  async migrateStorage(from: TokenStorageSetting, to: TokenStorageSetting): Promise<void> {
    if (from === to) {
      return;
    }

    const token = await this.readFromStorage(from);
    if (token === null) {
      return;
    }

    await this.writeToStorage(token, to);
    await this.cleanupStorage(from);
  }

  private async readFromStorage(storage: TokenStorageSetting): Promise<string | null> {
    switch (storage) {
      case "file": {
        const exists = await this.vault.adapter.exists(this.path);
        if (!exists) {
          return null;
        }

        const value = await this.vault.adapter.read(this.path);
        return value === "" ? null : value;
      }
      case "secrets": {
        const secretId = useSettingsStore.getState().apiTokenSecretId;
        const value = this.secrets.getSecret(secretId);
        return value === "" ? null : value;
      }
      default: {
        const _: never = storage;
        throw new Error("Unknown token storage setting");
      }
    }
  }

  private async writeToStorage(token: string, storage: TokenStorageSetting): Promise<void> {
    switch (storage) {
      case "file":
        await this.vault.adapter.write(this.path, token);
        return;
      case "secrets": {
        const secretId = useSettingsStore.getState().apiTokenSecretId;
        this.secrets.setSecret(secretId, token);
        return;
      }
      default: {
        const _: never = storage;
        throw new Error("Unknown token storage setting");
      }
    }
  }

  private async cleanupStorage(storage: TokenStorageSetting): Promise<void> {
    switch (storage) {
      case "file": {
        const exists = await this.vault.adapter.exists(this.path);
        if (exists) {
          await this.vault.adapter.remove(this.path);
        }
        return;
      }
      case "secrets": {
        const secretId = useSettingsStore.getState().apiTokenSecretId;
        this.secrets.setSecret(secretId, "");
        return;
      }
      default: {
        const _: never = storage;
        throw new Error("Unknown token storage setting");
      }
    }
  }
}
