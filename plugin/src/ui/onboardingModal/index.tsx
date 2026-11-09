import type React from "react";

import { t } from "@/i18n";
import { ModalContext, PluginContext } from "@/ui/context";

import { TokenValidation } from "../../token";
import { TokenInputForm } from "./TokenInputForm";
import "./styles.scss";

type OnTokenSubmitted = (token: string) => Promise<void>;

type OnboardingProps = {
  onTokenSubmit: OnTokenSubmitted;
};

export const OnboardingModal: React.FC<OnboardingProps> = ({ onTokenSubmit }) => {
  const modal = ModalContext.use();
  const plugin = PluginContext.use();
  const i18n = t().onboardingModal;

  const callback = (token: string) => {
    modal.close();
    onTokenSubmit(token).catch((e) => {
      console.error("Failed to save API token", e);
      void plugin.services.feedback.notice(i18n.failureNoticeMessage);
    });
  };

  return (
    <div className="onboarding-modal-root">
      <p>{i18n.explainer}</p>
      <p>
        {i18n.todoistGuideHint.before}
        <a href="https://todoist.com/help/articles/find-your-api-token-Jpzx9IIlB">
          {i18n.todoistGuideHint.linkText}
        </a>
        {i18n.todoistGuideHint.after}
      </p>
      <TokenInputForm onTokenSubmit={callback} tester={TokenValidation.DefaultTester} />
    </div>
  );
};
