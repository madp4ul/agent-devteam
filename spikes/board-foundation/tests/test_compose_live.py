import json
import os
import unittest
import urllib.request


@unittest.skipUnless(
    os.environ.get("BOARD_SPIKE_COMPOSE_URL"),
    "set BOARD_SPIKE_COMPOSE_URL after docker compose up --wait",
)
class LiveComposeIntegrationTests(unittest.TestCase):
    def test_running_container_can_reach_every_local_deployment_boundary(self):
        base_url = os.environ["BOARD_SPIKE_COMPOSE_URL"].rstrip("/")
        with urllib.request.urlopen(base_url + "/api/deployment-capabilities") as response:
            capabilities = json.load(response)

        self.assertTrue(capabilities["project_repository"]["readable"])
        self.assertTrue(capabilities["task_workspaces"]["writable"])
        self.assertTrue(capabilities["codex_authentication"]["available"])
        self.assertTrue(capabilities["project_containers"]["reachable"])


if __name__ == "__main__":
    unittest.main()
