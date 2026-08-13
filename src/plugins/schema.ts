import { z } from 'zod';

/* ---- data ---- */
export const FranchiseSchema = z.object({
  name: z.string(),
  abbr: z.string(),
  color: z.string(),
});
export type Franchise = z.infer<typeof FranchiseSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  franchise: z.string(),
  type: z.string(),
  start: z.string().nullable(),   // ISO date, null = TBA
  end: z.string().nullable(),
  desc: z.string(),
}).catchall(z.unknown());          // open extra fields (e.g. "round")
export type PluginItem = z.infer<typeof ItemSchema>;

export const DataSourceSchema = z.object({
  franchises: z.array(FranchiseSchema),
  items: z.array(ItemSchema),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

/* ---- derive hooks ---- */
export const GroupHookSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('deadline'), thresholdDays: z.number().int().positive() }),
  z.object({ mode: z.literal('category'), field: z.string() }),
  z.object({ mode: z.literal('static'), value: z.string() }),
]);
export type GroupHook = z.infer<typeof GroupHookSchema>;

export const TimeLabelHookSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('countdown') }),
  z.object({ mode: z.literal('date'), format: z.string().optional() }),
]);
export type TimeLabelHook = z.infer<typeof TimeLabelHookSchema>;

export const ProgressHookSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('range') }),
  z.object({ mode: z.literal('index'), currentField: z.string(), totalField: z.string() }),
  z.object({ mode: z.literal('ratio'), doneField: z.string(), totalField: z.string() }),
  z.object({ mode: z.literal('threshold'), target: z.number(), valueField: z.string(), direction: z.enum(['down', 'up']).optional() }),
  z.object({ mode: z.literal('none') }),
]);
export type ProgressHook = z.infer<typeof ProgressHookSchema>;

export const DeriveSpecSchema = z.object({
  group: GroupHookSchema.optional(),
  timeLabel: TimeLabelHookSchema.optional(),
  progress: ProgressHookSchema.optional(),
});
export type DeriveSpec = z.infer<typeof DeriveSpecSchema>;

/* ---- showIf condition (declarative, not an expression) ---- */
export const ConditionSchema = z.union([
  z.object({ field: z.string(), is: z.enum(['truthy', 'falsy', 'null', 'notNull']) }),
  z.object({ field: z.string(), eq: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ field: z.string(), gt: z.number() }),
  z.object({ field: z.string(), lt: z.number() }),
]);
export type Condition = z.infer<typeof ConditionSchema>;

/* ---- element tree ---- */
export const ElementNodeSchema: z.ZodType<ElementNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    value: z.string().optional(),
    props: z.record(z.string(), z.unknown()).optional(),
    showIf: ConditionSchema.optional(),
    action: z.string().optional(),
    children: z.array(ElementNodeSchema).optional(),
  }),
);
export type ElementNode = {
  type: string;
  value?: string;
  props?: Record<string, unknown>;
  showIf?: Condition;
  action?: string;
  children?: ElementNode[];
};

/* ---- actions ---- */
export const ActionDefSchema = z.object({
  kind: z.enum(['openItem', 'openUrl', 'callAsk', 'notify', 'toggleState']),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type ActionDef = z.infer<typeof ActionDefSchema>;

/* ---- list chrome (per-row chevron / hairline) ---- */
export const ListChromeSchema = z.object({
  chevron: z.boolean().optional(),
  hairline: z.boolean().optional(),
});
export type ListChrome = z.infer<typeof ListChromeSchema>;

/* ---- spec ---- */
export const TrackingPluginSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  version: z.number().int().positive(),
  data: DataSourceSchema,
  derive: DeriveSpecSchema.optional(),
  listRow: ElementNodeSchema.optional(),
  detail: ElementNodeSchema.optional(),
  list: ListChromeSchema.optional(),
  actions: z.record(z.string(), ActionDefSchema).optional(),
});
export type TrackingPluginSpec = z.infer<typeof TrackingPluginSpecSchema>;

/* ---- plugin list metadata (GET /api/plugins) ---- */
export const PluginMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  version: z.number().int().positive(),
});
export type PluginMeta = z.infer<typeof PluginMetaSchema>;
