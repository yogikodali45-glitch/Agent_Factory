import { registerAdapter, type Adapter } from "../../registry";
import { chatIntakeAdapter } from "./intake";
import { chatBuildAdapter } from "./build";

export const chatAdapter: Adapter = {
  intake: chatIntakeAdapter,
  build: chatBuildAdapter,
};

registerAdapter("chat", chatAdapter);
