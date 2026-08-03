import { Injectable } from "@nestjs/common";
import { FunctionSignature } from "./harness-types";
import { buildPythonSource } from "./python-harness";
import { buildJavaSource } from "./java-harness";
import { buildCppSource } from "./cpp-harness";
import { buildCSource } from "./c-harness";

@Injectable()
export class HarnessBuilderService {
  // Wraps the student's function-only submission with the driver code that
  // parses a test case's JSON args from stdin, calls the function, and
  // prints the return value as JSON — see the language-specific builders
  // for why each one needs its own hand-rolled parser/serializer.
  build(language: string, signature: FunctionSignature, studentCode: string): string {
    switch (language) {
      case "python":
        return buildPythonSource(signature, studentCode);
      case "java":
        return buildJavaSource(signature, studentCode);
      case "cpp":
        return buildCppSource(signature, studentCode);
      case "c":
        return buildCSource(signature, studentCode);
      default:
        throw new Error(`No harness builder for language "${language}"`);
    }
  }
}
