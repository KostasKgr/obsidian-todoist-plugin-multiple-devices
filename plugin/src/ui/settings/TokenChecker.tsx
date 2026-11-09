import type React from "react";
import { useEffect, useState } from "react";

import { t } from "@/i18n";
import { PluginContext } from "@/ui/context";
import { useQuietMode } from "@/ui/QuietBoundary";

import { TodoistApiClient } from "../../api";
import { ObsidianFetcher } from "../../api/fetcher";
import { TokenValidation } from "../../token";
import { TokenValidationIcon } from "../components/token-validation-icon";
import { Setting } from "./SettingItem";

type Props = {
  tester: (token: string) => Promise<boolean>;
};

export const TokenChecker: React.FC<Props> = ({ tester }) => {
  const plugin = PluginContext.use();
  const quiet = useQuietMode();
  const { token: tokenAccessor, todoist, modals } = plugin.services;

  const [tokenState, setTokenState] = useState<TokenValidation.Result>({
    kind: "in-progress",
  });
  const [tokenValidationCount, setTokenValidationCount] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: we are using tokenValidationCount to force a refresh when the modal is closed.
  useEffect(() => {
    setTokenState({ kind: "in-progress" });
    (async () => {
      const token = await tokenAccessor.read();
      if (token === null) {
        setTokenState({
          kind: "error",
          message: "API token not found",
        });
        return;
      }

      setTokenState(await TokenValidation.validate(token, tester));
    })();
  }, [plugin, tester, tokenValidationCount]);

  const openModal = () => {
    void modals.onboarding(
      {
        onTokenSubmit: async (token) => {
          await tokenAccessor.write(token);
          setTokenValidationCount((old) => old + 1);
          await todoist.initialize(new TodoistApiClient(token, new ObsidianFetcher()));
        },
      },
      true,
    );
  };

  const buttonLabel = t().settings.general.apiToken.buttonLabel;

  return (
    <>
      {!quiet && <TokenValidationIcon status={tokenState} />}
      <Setting.ButtonControl
        label={buttonLabel}
        icon="settings"
        onClick={openModal}
        disabled={tokenState.kind === "in-progress"}
      />
    </>
  );
};
