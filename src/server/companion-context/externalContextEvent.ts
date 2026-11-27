export interface ExternalContextEvent {
  source:
    | "map_node_complete"
    | "map_node_started"
    | "worksheet_event"
    | "game_narration"
    | "game_state_update"
    | "answer_reveal";
  /** Human-readable, <= 500 chars. */
  summary: string;
  /** Epoch ms. */
  occurredAt: number;
}
