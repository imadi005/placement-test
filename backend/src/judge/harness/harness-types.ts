// Deliberately small type grammar — covers the large majority of real
// interview-style problems (two-sum, reverse-string, palindrome-check, etc.)
// without needing nested arrays/objects. Extend this list (and every
// builder's type-dispatch) together if a problem genuinely needs more.
export type ParamType = "int" | "double" | "boolean" | "string" | "int[]" | "double[]" | "string[]" | "boolean[]";

export interface FunctionParameter {
  name: string;
  type: ParamType;
}

export interface FunctionSignature {
  functionName: string;
  parameters: FunctionParameter[];
  returnType: ParamType;
}
