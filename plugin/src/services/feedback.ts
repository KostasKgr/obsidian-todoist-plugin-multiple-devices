import { Notice } from "obsidian";

import type { VaultTokenAccessor } from "@/services/tokenAccessor";
import { useSettingsStore } from "@/settings";

/** A configured but invalid token must never enable quiet mode. */
export class FeedbackPolicy {
  private readonly token: VaultTokenAccessor;

  constructor(token: VaultTokenAccessor) {
    this.token = token;
  }

  async shouldSuppress(): Promise<boolean> {
    if (!useSettingsStore.getState().quietWhenNoToken) {
      return false;
    }

    try {
      const token = await this.token.read();
      return useSettingsStore.getState().quietWhenNoToken && token === null;
    } catch (error) {
      // A storage failure is not proof that no token exists. Preserve diagnostics.
      console.error("Failed to read API token for quiet mode", error);
      return false;
    }
  }

  async notice(message: string, duration?: number): Promise<void> {
    if (!(await this.shouldSuppress())) {
      new Notice(message, duration);
    }
  }
}
