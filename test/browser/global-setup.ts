import { startBrowserFixture } from "./fixture-server.ts";

export default async function globalSetup(): Promise<() => Promise<void>> {
  return startBrowserFixture();
}
