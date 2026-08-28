import { registerAdapter, type Adapter } from "../../registry";
import { chatIntakeAdapter } from "./intake";
import { chatBuildAdapter } from "./build";
import { chatTestAdapter } from "./test";

export const chatAdapter: Adapter = {
  intake: chatIntakeAdapter,
  build: chatBuildAdapter,
  test: chatTestAdapter,
};

registerAdapter("chat", chatAdapter);
