import { registerAdapter, type Adapter } from "../../registry";
import { chatIntakeAdapter } from "./intake";
import { chatBuildAdapter } from "./build";
import { chatTestAdapter } from "./test";
import { chatDeployAdapter } from "./deploy";

export const chatAdapter: Adapter = {
  intake: chatIntakeAdapter,
  build: chatBuildAdapter,
  test: chatTestAdapter,
  deploy: chatDeployAdapter,
};

registerAdapter("chat", chatAdapter);
