import { FunctionSignature } from "./harness-types";

// Python's json module already produces native list/float-or-int/str/bool
// values matching our JSON test-case grammar exactly — no type-conversion
// layer needed, unlike the statically-typed languages.
export function buildPythonSource(signature: FunctionSignature, studentCode: string): string {
  return [
    "import json",
    "import sys",
    "",
    studentCode,
    "",
    "_args = json.loads(sys.stdin.read())",
    `_result = ${signature.functionName}(*_args)`,
    "print(json.dumps(_result))",
  ].join("\n");
}
