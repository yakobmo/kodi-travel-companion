import type { MemberRole } from "../domain/types.js";

export type AgentActionType =
  | "recommend_place"
  | "explain_place"
  | "set_group_destination"
  | "create_route"
  | "mark_place_visited"
  | "open_navigation_for_group";

const operationalActionTypes = new Set<AgentActionType>([
  "set_group_destination",
  "create_route",
  "mark_place_visited",
  "open_navigation_for_group"
]);

export function isAgentActionType(value: unknown): value is AgentActionType {
  return (
    value === "recommend_place" ||
    value === "explain_place" ||
    value === "set_group_destination" ||
    value === "create_route" ||
    value === "mark_place_visited" ||
    value === "open_navigation_for_group"
  );
}

export function canMemberRunAgentAction(input: { role: MemberRole; actionType: AgentActionType }) {
  const requiresAdminApproval = operationalActionTypes.has(input.actionType);
  const isAdmin = input.role === "owner" || input.role === "admin";

  return {
    allowed: !requiresAdminApproval || isAdmin,
    requiresAdminApproval,
    reason:
      requiresAdminApproval && !isAdmin
        ? "operational_action_requires_admin"
        : "allowed_by_role_policy"
  };
}
