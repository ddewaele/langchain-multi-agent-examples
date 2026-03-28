/**
 * Runtime patch for the Zod v3/v4 interop bug in zod@3.25.x.
 *
 * Problem: zod@3.25.x ships a `zod/v3` compatibility layer alongside
 * native Zod v4. When libraries (like deepagents' FilesystemMiddleware)
 * create schemas using Zod v4 types and those get mixed into a v3
 * ZodObject.shape, the v3 `_parse` method is called on v4 types that
 * don't have it, causing: "TypeError: keyValidator._parse is not a function"
 *
 * Fix: Monkey-patch ZodObject.prototype._parse in the v3 layer to detect
 * v4 types (they have `_zod` but no `_parse`) and run them through their
 * v4 parse path, converting the result to v3 format.
 *
 * This MUST be imported before any deepagents or langchain code.
 */

import { z as z3 } from "zod/v3";

// Get the ZodObject prototype from an actual instance
const zodObjInstance = z3.object({});
const ZodObjectProto = Object.getPrototypeOf(zodObjInstance);
const original_parse = ZodObjectProto._parse;

ZodObjectProto._parse = function (this: any, input: any) {
  // Patch any v4 types in the shape to have a v3-compatible _parse
  const cached = this._getCached?.();
  if (cached?.shape) {
    for (const key of Object.keys(cached.shape)) {
      const validator = cached.shape[key];
      if (validator && typeof validator._parse !== "function" && validator._zod) {
        // This is a Zod v4 type — wrap it with a v3-compatible _parse
        validator._parse = function (input: any) {
          const data = input.data;
          const result = validator.safeParse(data);
          if (result.success) {
            return { status: "valid", value: result.data };
          }
          return {
            status: "dirty",
            value: data,
          };
        };
      }
    }
  }
  return original_parse.call(this, input);
};

// Also patch ZodArray and ZodDefault which may wrap v4 types
const zodArrayInstance = z3.array(z3.string());
const ZodArrayProto = Object.getPrototypeOf(zodArrayInstance);
const originalArrayParse = ZodArrayProto._parse;

ZodArrayProto._parse = function (this: any, input: any) {
  const type = this._def?.type;
  if (type && typeof type._parse !== "function" && type._zod) {
    type._parse = function (input: any) {
      const result = type.safeParse(input.data);
      if (result.success) return { status: "valid", value: result.data };
      return { status: "dirty", value: input.data };
    };
  }
  return originalArrayParse.call(this, input);
};

export {};
