import type { CoordinationMigration } from "../coordination-database.ts";
export const conversationPinCheckpointsMigration: CoordinationMigration = {
  id: "0007_conversation_pin_checkpoints",
  apply(database) {
    database.exec("ALTER TABLE agent_conversations ADD COLUMN delivered_pin_ids_json TEXT NOT NULL DEFAULT '[]'");
  },
};
