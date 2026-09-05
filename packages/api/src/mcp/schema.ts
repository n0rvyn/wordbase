import { z, type ZodTypeAny } from 'zod';

// Each MCP tool below declares its input schema as a plain
// { type, description, required, enum, ... } descriptor map. The MCP SDK's
// tool()/registerTool() expect a Zod raw shape (values must be Zod types);
// when tool() sees a non-Zod object it silently treats it as `annotations`
// instead — which is what produced the `annotations.title` validation crash
// on the client for the tools that had a `title` field, and left every other
// tool with no advertised parameters. Compiling each descriptor to a Zod type
// centrally keeps the tool call sites declarative and self-contained.
export type PropDescriptor = {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  enum?: readonly string[];
  items?: 'string' | 'number' | ZodTypeAny; // array element type
  shape?: Record<string, PropDescriptor>; // object fields
  min?: number;
  max?: number;
};

function buildOne(def: PropDescriptor): ZodTypeAny {
  let zt: ZodTypeAny;
  switch (def.type) {
    case 'string': {
      zt = def.enum ? z.enum(def.enum as [string, ...string[]]) : z.string();
      break;
    }
    case 'number': {
      let num = z.number();
      if (typeof def.min === 'number') num = num.min(def.min);
      if (typeof def.max === 'number') num = num.max(def.max);
      zt = num;
      break;
    }
    case 'boolean': {
      // Coerce legacy 0/1 numeric callers into real booleans.
      zt = z
        .union([z.boolean(), z.number().int().min(0).max(1)])
        .transform((v) => (typeof v === 'number' ? v === 1 : v));
      break;
    }
    case 'array': {
      // `enum` constrains the ELEMENTS of an array descriptor. Reading it here
      // is not optional politeness: an array descriptor that declares an enum
      // the compiler ignores advertises a constraint it does not enforce, and
      // the caller's typo then reaches the handler as a plain string. That is
      // exactly what let analytics_query accept sections:['not_a_section'] and
      // answer {} — indistinguishable from "no data" to an LLM caller.
      const itemSchema: ZodTypeAny = def.enum
        ? z.enum(def.enum as [string, ...string[]])
        : def.items === 'number'
          ? z.number()
          : def.items === 'string' || def.items === undefined
            ? z.string()
            : (def.items as ZodTypeAny);
      // Normalize a comma-separated string into an array, to stay compatible
      // with existing callers that pass "a,b" instead of ["a", "b"]. A string
      // that looks like a JSON array literal (leading `[`, e.g. an
      // object-array param sent as `JSON.stringify([...])`) is parsed as JSON
      // instead — comma-splitting would shred a JSON array of objects. If the
      // JSON.parse fails, fall through to comma-splitting so the caller still
      // gets a normal "expected array" validation error rather than us
      // swallowing the parse failure here.
      zt = z.preprocess(
        (csv) => {
          if (typeof csv !== 'string') return csv;
          const trimmed = csv.trim();
          if (trimmed.startsWith('[')) {
            try {
              return JSON.parse(trimmed);
            } catch {
              // fall through to comma-split below
            }
          }
          return trimmed
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        },
        z.array(itemSchema),
      );
      break;
    }
    case 'object': {
      // No `shape` given means the object's keys are caller-defined (e.g. a
      // free-form links/meta map) rather than a fixed set of fields. A bare
      // z.object({}) SILENTLY STRIPS every key outside its (empty) shape —
      // confirmed via z.object({}).safeParse({a:1}) => {success:true,data:{}}
      // — so it must fall back to z.record() instead of losing caller data.
      zt = def.shape ? z.object(buildInputSchema(def.shape)) : z.record(z.string(), z.unknown());
      break;
    }
    default: {
      // Registration-time throw — never silently degrade to z.string(), which
      // would make it look like the field has a constraint when it has none.
      throw new Error(`buildInputSchema: unknown descriptor type "${(def as { type: string }).type}"`);
    }
  }

  if (def.required !== true) zt = zt.optional();
  if (def.description) zt = zt.describe(def.description);
  return zt;
}

export function buildInputSchema(shape: Record<string, PropDescriptor>): Record<string, ZodTypeAny> {
  const out: Record<string, ZodTypeAny> = {};
  for (const [key, def] of Object.entries(shape)) {
    out[key] = buildOne(def);
  }
  return out;
}
