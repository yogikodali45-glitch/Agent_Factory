import { registerAdapter, type Adapter } from "../../registry";
import { chatIntakeAdapter } from "./intake";

export const chatAdapter: Adapter = {
  intake: chatIntakeAdapter,
};

registerAdapter("chat", chatAdapter);
