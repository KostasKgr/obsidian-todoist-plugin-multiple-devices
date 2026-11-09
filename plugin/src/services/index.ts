import { TodoistAdapter } from "@/data";
import type TodoistPlugin from "@/index";
import { FeedbackPolicy } from "@/services/feedback";
import { ModalHandler } from "@/services/modals";
import { VaultTokenAccessor } from "@/services/tokenAccessor";

export type Services = {
  feedback: FeedbackPolicy;
  modals: ModalHandler;
  token: VaultTokenAccessor;
  todoist: TodoistAdapter;
};

export const makeServices = (plugin: TodoistPlugin): Services => {
  const token = new VaultTokenAccessor(plugin.app.vault, plugin.app.secretStorage);
  return {
    feedback: new FeedbackPolicy(token),
    modals: new ModalHandler(plugin),
    token,
    todoist: new TodoistAdapter(),
  };
};
