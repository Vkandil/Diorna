import { z } from "zod";

const operationId = z.string().trim().min(1).max(80);
const title = z.string().trim().min(1).max(180);
const optionalText = z
  .string()
  .max(20_000)
  .nullable()
  .optional()
  .transform((value) => value ?? undefined);

export const aiNoteOperationSchema = z
  .object({
    id: operationId,
    type: z.literal("create_note"),
    title,
    bodyMarkdown: z.string().max(80_000),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  })
  .strict();

export const aiMapNodeSchema = z
  .object({
    id: operationId,
    kind: z.enum(["text", "note"]),
    title,
    body: optionalText,
    noteOperationId: operationId
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
    mentionedNoteId: operationId
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
    locked: z.boolean().default(false),
  })
  .strict();

export const aiMapOperationSchema = z
  .object({
    id: operationId,
    type: z.literal("create_map"),
    name: title,
    nodes: z.array(aiMapNodeSchema).min(1).max(40),
    edges: z
      .array(
        z
          .object({
            from: operationId,
            to: operationId,
            label: z
              .string()
              .max(120)
              .nullable()
              .optional()
              .transform((value) => value ?? undefined),
          })
          .strict(),
      )
      .max(80)
      .default([]),
  })
  .strict();

const isoDateTime = z
  .string()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      !Number.isNaN(Date.parse(value)),
    { message: "Expected an ISO date-time with a timezone offset" },
  );

export const aiCalendarOperationSchema = z
  .object({
    id: operationId,
    type: z.literal("create_calendar_item"),
    kind: z.enum(["event", "task"]),
    title,
    description: z.string().max(10_000).default(""),
    startAt: isoDateTime,
    endAt: isoDateTime,
    allDay: z.boolean().default(false),
    category: z.string().trim().max(80).default(""),
    priority: z.enum(["none", "low", "medium", "high"]).default("none"),
  })
  .strict()
  .refine((operation) => Date.parse(operation.endAt) >= Date.parse(operation.startAt), {
    message: "Calendar end must not precede its start",
    path: ["endAt"],
  });

export const aiHabitOperationSchema = z
  .object({
    id: operationId,
    type: z.literal("create_habit"),
    name: title,
    description: z.string().max(10_000).default(""),
    category: z.string().trim().max(80).default(""),
    tracking: z.enum(["checkbox", "quantity"]),
    unit: z.string().trim().max(40).default(""),
    target: z.number().finite().positive().nullable().default(null),
    activeWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  })
  .strict()
  .refine((operation) => operation.tracking === "checkbox" || operation.target !== null, {
    message: "Quantity habits require a target",
    path: ["target"],
  });

export const aiProjectOperationSchema = z
  .object({
    id: operationId,
    type: z.literal("upsert_project"),
    existingProjectId: operationId.nullable().default(null),
    name: title,
    outcome: z.string().trim().min(1).max(2_000),
    description: z.string().max(10_000).default(""),
    kind: z.enum(["work", "study", "personal", "health", "custom"]),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    goalTitle: z.string().trim().min(1).max(180).nullable().default(null),
    health: z.enum(["on-track", "at-risk", "blocked"]).default("on-track"),
    nextAction: z.string().max(1_000).default(""),
    stakeholders: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    milestoneTitles: z.array(title).max(20).default([]),
    linkedOperationIds: z.array(operationId).max(20).default([]),
  })
  .strict();

export const aiFocusOperationSchema = z
  .object({
    id: operationId,
    type: z.literal("create_focus_block"),
    title,
    intention: z.string().max(2_000).default(""),
    mode: z.enum(["deep-work", "study", "creative", "admin", "meeting-prep", "personal"]),
    plannedMinutes: z.number().int().min(5).max(480),
    scheduledAt: isoDateTime.nullable().default(null),
    priorityDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    sourceType: z.enum([
      "calendar",
      "project",
      "goal",
      "note",
      "map",
      "habit",
      "training",
      "custom",
    ]),
    sourceId: operationId.nullable().default(null),
    distractionShield: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  })
  .strict()
  .refine((operation) => operation.sourceType === "custom" || operation.sourceId !== null, {
    message: "Connected focus blocks require an exact source ID",
    path: ["sourceId"],
  });

export const aiOperationSchema = z.discriminatedUnion("type", [
  aiNoteOperationSchema,
  aiMapOperationSchema,
  aiCalendarOperationSchema,
  aiHabitOperationSchema,
  aiProjectOperationSchema,
  aiFocusOperationSchema,
]);

export const aiPlanSchema = z
  .object({
    version: z.literal(1),
    summary: z.string().trim().min(1).max(500),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
    operations: z.array(aiOperationSchema).min(1).max(20),
  })
  .strict()
  .superRefine((plan, context) => {
    const operationIds = new Set<string>();
    const noteOperationIds = new Set(
      plan.operations
        .filter((operation) => operation.type === "create_note")
        .map((operation) => operation.id),
    );
    for (const operation of plan.operations) {
      if (operationIds.has(operation.id))
        context.addIssue({
          code: "custom",
          message: `Duplicate operation id: ${operation.id}`,
          path: ["operations"],
        });
      operationIds.add(operation.id);
    }
    for (const operation of plan.operations) {
      if (operation.type === "upsert_project") {
        for (const linkedId of operation.linkedOperationIds)
          if (
            linkedId === operation.id ||
            !operationIds.has(linkedId) ||
            !["create_note", "create_map", "create_calendar_item", "create_habit"].includes(
              plan.operations.find((entry) => entry.id === linkedId)?.type ?? "",
            )
          )
            context.addIssue({
              code: "custom",
              message: `Unknown or unsupported linked operation: ${linkedId}`,
              path: ["operations"],
            });
        continue;
      }
      if (operation.type !== "create_map") continue;
      const nodeIds = new Set(operation.nodes.map((node) => node.id));
      const centralNodes = operation.nodes.filter((node) => node.locked);
      if (centralNodes.length !== 1)
        context.addIssue({
          code: "custom",
          message: `Map must have exactly one locked central node`,
          path: ["operations"],
        });
      for (const node of operation.nodes)
        if (node.noteOperationId && !noteOperationIds.has(node.noteOperationId))
          context.addIssue({
            code: "custom",
            message: `Unknown note operation: ${node.noteOperationId}`,
            path: ["operations"],
          });
      for (const edge of operation.edges)
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to))
          context.addIssue({
            code: "custom",
            message: `Map edge references an unknown node`,
            path: ["operations"],
          });
        else if (!edge.label?.trim())
          context.addIssue({
            code: "custom",
            message: `Map edge ${edge.from} → ${edge.to} needs a relationship label`,
            path: ["operations"],
          });
      if (operation.nodes.length > 1) {
        const root = centralNodes[0] ?? operation.nodes[0]!;
        const reachable = new Set<string>([root.id]);
        const queue = [root.id];
        while (queue.length) {
          const current = queue.shift()!;
          for (const edge of operation.edges) {
            if (edge.from !== current || reachable.has(edge.to) || !nodeIds.has(edge.to)) continue;
            reachable.add(edge.to);
            queue.push(edge.to);
          }
        }
        const disconnected = operation.nodes
          .filter((node) => !reachable.has(node.id))
          .map((node) => node.id);
        if (disconnected.length)
          context.addIssue({
            code: "custom",
            message: `Map nodes must be reachable from the central node: ${disconnected.join(", ")}`,
            path: ["operations"],
          });
      }
    }
  });

export type AiPlan = z.infer<typeof aiPlanSchema>;
export type AiOperation = z.infer<typeof aiOperationSchema>;
export type AiMapOperation = z.infer<typeof aiMapOperationSchema>;

export const aiPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "summary", "assumptions", "operations"],
  properties: {
    version: { type: "integer", const: 1 },
    summary: { type: "string", minLength: 1, maxLength: 500 },
    assumptions: { type: "array", maxItems: 12, items: { type: "string" } },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "type", "title", "bodyMarkdown", "tags"],
            properties: {
              id: { type: "string" },
              type: { const: "create_note" },
              title: { type: "string" },
              bodyMarkdown: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "type", "name", "nodes", "edges"],
            properties: {
              id: { type: "string" },
              type: { const: "create_map" },
              name: { type: "string" },
              nodes: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "id",
                    "kind",
                    "title",
                    "body",
                    "noteOperationId",
                    "mentionedNoteId",
                    "locked",
                  ],
                  properties: {
                    id: { type: "string" },
                    kind: { enum: ["text", "note"] },
                    title: { type: "string" },
                    body: { type: ["string", "null"] },
                    noteOperationId: { type: ["string", "null"] },
                    mentionedNoteId: { type: ["string", "null"] },
                    locked: { type: "boolean" },
                  },
                },
              },
              edges: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["from", "to", "label"],
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    label: { type: ["string", "null"] },
                  },
                },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "type",
              "kind",
              "title",
              "description",
              "startAt",
              "endAt",
              "allDay",
              "category",
              "priority",
            ],
            properties: {
              id: { type: "string" },
              type: { const: "create_calendar_item" },
              kind: { enum: ["event", "task"] },
              title: { type: "string" },
              description: { type: "string" },
              startAt: { type: "string" },
              endAt: { type: "string" },
              allDay: { type: "boolean" },
              category: { type: "string" },
              priority: { enum: ["none", "low", "medium", "high"] },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "type",
              "name",
              "description",
              "category",
              "tracking",
              "unit",
              "target",
              "activeWeekdays",
            ],
            properties: {
              id: { type: "string" },
              type: { const: "create_habit" },
              name: { type: "string" },
              description: { type: "string" },
              category: { type: "string" },
              tracking: { enum: ["checkbox", "quantity"] },
              unit: { type: "string" },
              target: { type: ["number", "null"] },
              activeWeekdays: {
                type: "array",
                minItems: 1,
                items: { type: "integer", minimum: 0, maximum: 6 },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "type",
              "existingProjectId",
              "name",
              "outcome",
              "description",
              "kind",
              "targetDate",
              "goalTitle",
              "health",
              "nextAction",
              "stakeholders",
              "tags",
              "milestoneTitles",
              "linkedOperationIds",
            ],
            properties: {
              id: { type: "string" },
              type: { const: "upsert_project" },
              existingProjectId: { type: ["string", "null"] },
              name: { type: "string" },
              outcome: { type: "string" },
              description: { type: "string" },
              kind: { enum: ["work", "study", "personal", "health", "custom"] },
              targetDate: { type: ["string", "null"] },
              goalTitle: { type: ["string", "null"] },
              health: { enum: ["on-track", "at-risk", "blocked"] },
              nextAction: { type: "string" },
              stakeholders: { type: "array", items: { type: "string" } },
              tags: { type: "array", items: { type: "string" } },
              milestoneTitles: { type: "array", items: { type: "string" } },
              linkedOperationIds: { type: "array", items: { type: "string" } },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "type",
              "title",
              "intention",
              "mode",
              "plannedMinutes",
              "scheduledAt",
              "priorityDate",
              "sourceType",
              "sourceId",
              "distractionShield",
              "tags",
            ],
            properties: {
              id: { type: "string" },
              type: { const: "create_focus_block" },
              title: { type: "string" },
              intention: { type: "string" },
              mode: {
                enum: ["deep-work", "study", "creative", "admin", "meeting-prep", "personal"],
              },
              plannedMinutes: { type: "integer", minimum: 5, maximum: 480 },
              scheduledAt: { type: ["string", "null"] },
              priorityDate: { type: ["string", "null"] },
              sourceType: {
                enum: ["calendar", "project", "goal", "note", "map", "habit", "training", "custom"],
              },
              sourceId: { type: ["string", "null"] },
              distractionShield: { type: "array", items: { type: "string" } },
              tags: { type: "array", items: { type: "string" } },
            },
          },
        ],
      },
    },
  },
} as const;
