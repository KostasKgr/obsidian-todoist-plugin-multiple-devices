import type { SecretStorage, Vault } from "obsidian";
import { vi } from "vitest";

import { VaultTokenAccessor } from "@/services/tokenAccessor";

/** Entirely in-memory storage; never reads a real vault or Obsidian secrets. */
export const makeTokenStorage = () => {
  const files = new Map<string, string>();
  const secretValues = new Map<string, string>();
  const adapter = {
    exists: vi.fn(async (path: string) => files.has(path)),
    read: vi.fn(async (path: string) => files.get(path) ?? ""),
    write: vi.fn(async (path: string, value: string) => {
      files.set(path, value);
    }),
    remove: vi.fn(async (path: string) => {
      files.delete(path);
    }),
  };
  const secrets = {
    getSecret: vi.fn((id: string) => secretValues.get(id) ?? null),
    setSecret: vi.fn((id: string, value: string) => {
      secretValues.set(id, value);
    }),
  };
  const vault = { configDir: ".obsidian", adapter };
  const token = new VaultTokenAccessor(
    vault as unknown as Vault,
    secrets as unknown as SecretStorage,
  );
  return { token, files, secretValues, adapter, secrets, vault };
};
