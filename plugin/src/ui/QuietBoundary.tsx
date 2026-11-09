import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { useStore } from "zustand";

import { useSettingsStore } from "@/settings";
import { PluginContext } from "@/ui/context";

export const useQuietMode = (): boolean => {
  const plugin = PluginContext.use();
  const enabled = useSettingsStore((settings) => settings.quietWhenNoToken);
  const storage = useSettingsStore((settings) => settings.tokenStorage);
  const secretId = useSettingsStore((settings) => settings.apiTokenSecretId);
  const presence = useStore(plugin.services.token.presence);

  // biome-ignore lint/correctness/useExhaustiveDependencies: settings changes must re-check the selected token storage.
  useEffect(() => {
    const refresh = () => {
      // Re-read even when quiet mode is disabled so changes are observed on re-enable.
      void plugin.services.token.read().catch((error) => {
        console.error("Failed to refresh API token presence", error);
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [plugin, storage, secretId, enabled]);

  // Hide while the selected storage is being checked to avoid flashing warnings.
  const pending = presence.storage !== storage || presence.secretId !== secretId;
  return enabled && (pending || presence.status === "unknown" || presence.status === "absent");
};

export const QuietBoundary = ({ children }: PropsWithChildren) => {
  const quiet = useQuietMode();
  return quiet ? null : children;
};
