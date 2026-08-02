import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DeploymentContractTests(unittest.TestCase):
    def test_compose_exposes_board_and_mounts_local_agent_boundaries(self):
        compose = (ROOT / "compose.yaml").read_text(encoding="utf-8")

        self.assertIn("coordination:", compose)
        self.assertIn('"8088:8080"', compose)
        self.assertIn("PROJECT_REPOSITORY_PATH", compose)
        self.assertIn("TASK_WORKSPACES_PATH", compose)
        self.assertIn("CODEX_HOME_PATH", compose)
        self.assertIn("project-tool:", compose)
        self.assertIn("coordination-net", compose)

    def test_decision_is_explicit_and_ticket_15_is_out_of_scope(self):
        decision = (ROOT / "DECISION.md").read_text(encoding="utf-8")

        self.assertIn("Decision: NO-GO for Kanboard", decision)
        self.assertIn("custom-board fallback", decision)
        self.assertIn("Ticket 15", decision)

    def test_handoff_distinguishes_contracts_from_disposable_spike_code(self):
        handoff = (ROOT / "HANDOFF.md").read_text(encoding="utf-8")

        self.assertIn("Preserve", handoff)
        self.assertIn("Replace", handoff)
        self.assertIn("Defer", handoff)
        self.assertIn("TypeScript", handoff)
        self.assertIn("deep application module", handoff)

    def test_ticket_15_names_the_production_starting_point(self):
        ticket = (
            ROOT.parents[1]
            / ".scratch"
            / "agent-coordination-framework"
            / "issues"
            / "15-start-validated-paused-process.md"
        ).read_text(encoding="utf-8")

        self.assertIn("Production starting point", ticket)
        self.assertIn("TypeScript", ticket)
        self.assertIn("deep application module", ticket)


if __name__ == "__main__":
    unittest.main()
