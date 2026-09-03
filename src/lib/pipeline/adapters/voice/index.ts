import { registerAdapter, type Adapter } from "../../registry";
import { voiceIntakeAdapter } from "./intake";
import { voiceBuildAdapter } from "./build";
import { voiceTestAdapter } from "./test";
import { voiceDeployAdapter } from "./deploy";

export const voiceAdapter: Adapter = {
  intake: voiceIntakeAdapter,
  build: voiceBuildAdapter,
  test: voiceTestAdapter,
  deploy: voiceDeployAdapter,
};

registerAdapter("voice", voiceAdapter);
