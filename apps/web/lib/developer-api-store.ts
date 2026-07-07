import {
  InMemoryDeveloperApiStore,
  createDeveloperSecretApi
} from "../../../packages/core/src/developer-api";

export const developerApiStore = new InMemoryDeveloperApiStore();
export const developerApi = createDeveloperSecretApi({ store: developerApiStore });
