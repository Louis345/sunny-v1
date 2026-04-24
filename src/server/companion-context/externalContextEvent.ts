export interface ExternalContextEvent {
  source: "map_node_complete" | "map_node_started" | "worksheet_event";
  /** Human-readable, <= 500 chars. */
  summary: string;
  /** Epoch ms. */
  occurredAt: number;
}
