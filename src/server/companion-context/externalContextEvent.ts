export interface ExternalContextEvent {
  source: "map_node_complete" | "worksheet_event";
  /** Human-readable, <= 500 chars. */
  summary: string;
  /** Epoch ms. */
  occurredAt: number;
}
