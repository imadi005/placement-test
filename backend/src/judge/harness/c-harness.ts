import { FunctionSignature, ParamType } from "./harness-types";

// C has no generics/dynamic arrays/strings-with-length, so this follows
// LeetCode's own real C convention (the only sane way to do this in C):
// an array parameter `nums: int[]` becomes TWO C parameters
// `int* nums, int numsSize`, and an array return type gets an implicit
// trailing `int* returnSize` output parameter the student's code must set.
// The coordinator must write the starter/expected signature using this
// exact convention (documented in the authoring UI) — this harness only
// needs functionName/parameters/returnType, it doesn't parse the student's
// code, just concatenates it.
function cDeclType(type: ParamType): string {
  switch (type) {
    case "int":
      return "int";
    case "double":
      return "double";
    case "boolean":
      return "bool";
    case "string":
      return "char*";
    case "int[]":
      return "int*";
    case "double[]":
      return "double*";
    case "string[]":
      return "char**";
    case "boolean[]":
      return "int*"; // bool arrays represented as 0/1 ints — C has no bool[] ergonomics worth the complexity here
  }
}

export function buildCSource(signature: FunctionSignature, studentCode: string): string {
  const decls: string[] = [];
  const callArgs: string[] = [];

  signature.parameters.forEach((p, i) => {
    const varName = `__a${i}`;
    switch (p.type) {
      case "int":
        decls.push(`    int ${varName} = __asInt(__parsed.arr[${i}]);`);
        callArgs.push(varName);
        break;
      case "double":
        decls.push(`    double ${varName} = __asDouble(__parsed.arr[${i}]);`);
        callArgs.push(varName);
        break;
      case "boolean":
        decls.push(`    bool ${varName} = __asBool(__parsed.arr[${i}]);`);
        callArgs.push(varName);
        break;
      case "string":
        decls.push(`    char* ${varName} = __asString(__parsed.arr[${i}]);`);
        callArgs.push(varName);
        break;
      case "int[]":
        decls.push(`    int ${varName}Size;`, `    int* ${varName} = __asIntArr(__parsed.arr[${i}], &${varName}Size);`);
        callArgs.push(varName, `${varName}Size`);
        break;
      case "double[]":
        decls.push(
          `    int ${varName}Size;`,
          `    double* ${varName} = __asDoubleArr(__parsed.arr[${i}], &${varName}Size);`
        );
        callArgs.push(varName, `${varName}Size`);
        break;
      case "string[]":
        decls.push(
          `    int ${varName}Size;`,
          `    char** ${varName} = __asStringArr(__parsed.arr[${i}], &${varName}Size);`
        );
        callArgs.push(varName, `${varName}Size`);
        break;
      case "boolean[]":
        decls.push(`    int ${varName}Size;`, `    int* ${varName} = __asBoolArr(__parsed.arr[${i}], &${varName}Size);`);
        callArgs.push(varName, `${varName}Size`);
        break;
    }
  });

  const isArrayReturn = signature.returnType.endsWith("[]");
  if (isArrayReturn) callArgs.push("&__returnSize");

  const callExpr = `${signature.functionName}(${callArgs.join(", ")})`;

  let resultDecl: string;
  let printStmt: string;
  switch (signature.returnType) {
    case "int":
      resultDecl = `int __result = ${callExpr};`;
      printStmt = `printf("%d", __result);`;
      break;
    case "double":
      resultDecl = `double __result = ${callExpr};`;
      printStmt = `__printNum(__result);`;
      break;
    case "boolean":
      resultDecl = `bool __result = ${callExpr};`;
      printStmt = `printf(__result ? "true" : "false");`;
      break;
    case "string":
      resultDecl = `char* __result = ${callExpr};`;
      printStmt = `printf("\\"%s\\"", __result);`;
      break;
    case "int[]":
      resultDecl = `int __returnSize;\n    int* __result = ${callExpr};`;
      printStmt =
        `printf("[");\n    for (int __i = 0; __i < __returnSize; __i++) { if (__i) printf(","); printf("%d", __result[__i]); }\n    printf("]");`;
      break;
    case "double[]":
      resultDecl = `int __returnSize;\n    double* __result = ${callExpr};`;
      printStmt =
        `printf("[");\n    for (int __i = 0; __i < __returnSize; __i++) { if (__i) printf(","); __printNum(__result[__i]); }\n    printf("]");`;
      break;
    case "string[]":
      resultDecl = `int __returnSize;\n    char** __result = ${callExpr};`;
      printStmt =
        `printf("[");\n    for (int __i = 0; __i < __returnSize; __i++) { if (__i) printf(","); printf("\\"%s\\"", __result[__i]); }\n    printf("]");`;
      break;
    case "boolean[]":
      resultDecl = `int __returnSize;\n    int* __result = ${callExpr};`;
      printStmt =
        `printf("[");\n    for (int __i = 0; __i < __returnSize; __i++) { if (__i) printf(","); printf(__result[__i] ? "true" : "false"); }\n    printf("]");`;
      break;
    default:
      resultDecl = `int __result = ${callExpr};`;
      printStmt = `printf("%d", __result);`;
  }

  return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdbool.h>

typedef struct JsonValue {
    int type; // 0=num, 1=str, 2=bool, 3=arr
    double num;
    char* str;
    int boolean;
    struct JsonValue* arr;
    int arrLen;
} JsonValue;

static char* __src;
static int __pos;

static void __skipWs() { while (isspace((unsigned char)__src[__pos])) __pos++; }

JsonValue __parseValue();

JsonValue __parseArray() {
    JsonValue v; v.type = 3; v.arrLen = 0;
    int cap = 4;
    v.arr = (JsonValue*)malloc(sizeof(JsonValue) * cap);
    __pos++;
    __skipWs();
    if (__src[__pos] == ']') { __pos++; return v; }
    while (1) {
        if (v.arrLen >= cap) { cap *= 2; v.arr = (JsonValue*)realloc(v.arr, sizeof(JsonValue) * cap); }
        v.arr[v.arrLen++] = __parseValue();
        __skipWs();
        if (__src[__pos] == ',') { __pos++; __skipWs(); continue; }
        if (__src[__pos] == ']') { __pos++; break; }
    }
    return v;
}

JsonValue __parseString() {
    JsonValue v; v.type = 1;
    __pos++;
    char buf[65536]; int len = 0;
    while (__src[__pos] != '"') {
        char c = __src[__pos];
        if (c == '\\\\') {
            __pos++;
            char esc = __src[__pos];
            if (esc == 'n') buf[len++] = '\\n';
            else if (esc == 't') buf[len++] = '\\t';
            else buf[len++] = esc;
        } else {
            buf[len++] = c;
        }
        __pos++;
    }
    __pos++;
    buf[len] = '\\0';
    v.str = strdup(buf);
    return v;
}

JsonValue __parseBool() {
    JsonValue v; v.type = 2;
    if (strncmp(__src + __pos, "true", 4) == 0) { v.boolean = 1; __pos += 4; }
    else { v.boolean = 0; __pos += 5; }
    return v;
}

JsonValue __parseNumber() {
    JsonValue v; v.type = 0;
    int start = __pos;
    while (isdigit((unsigned char)__src[__pos]) || strchr("-+.eE", __src[__pos])) __pos++;
    char buf[64];
    int len = __pos - start;
    strncpy(buf, __src + start, len); buf[len] = '\\0';
    v.num = atof(buf);
    return v;
}

JsonValue __parseValue() {
    __skipWs();
    char c = __src[__pos];
    if (c == '[') return __parseArray();
    if (c == '"') return __parseString();
    if (c == 't' || c == 'f') return __parseBool();
    return __parseNumber();
}

static int __asInt(JsonValue v) { return (int)v.num; }
static double __asDouble(JsonValue v) { return v.num; }
static bool __asBool(JsonValue v) { return v.boolean; }
static char* __asString(JsonValue v) { return v.str; }
static int* __asIntArr(JsonValue v, int* outSize) {
    int* r = (int*)malloc(sizeof(int) * (v.arrLen > 0 ? v.arrLen : 1));
    for (int i = 0; i < v.arrLen; i++) r[i] = (int)v.arr[i].num;
    *outSize = v.arrLen;
    return r;
}
static double* __asDoubleArr(JsonValue v, int* outSize) {
    double* r = (double*)malloc(sizeof(double) * (v.arrLen > 0 ? v.arrLen : 1));
    for (int i = 0; i < v.arrLen; i++) r[i] = v.arr[i].num;
    *outSize = v.arrLen;
    return r;
}
static char** __asStringArr(JsonValue v, int* outSize) {
    char** r = (char**)malloc(sizeof(char*) * (v.arrLen > 0 ? v.arrLen : 1));
    for (int i = 0; i < v.arrLen; i++) r[i] = v.arr[i].str;
    *outSize = v.arrLen;
    return r;
}
static int* __asBoolArr(JsonValue v, int* outSize) {
    int* r = (int*)malloc(sizeof(int) * (v.arrLen > 0 ? v.arrLen : 1));
    for (int i = 0; i < v.arrLen; i++) r[i] = v.arr[i].boolean;
    *outSize = v.arrLen;
    return r;
}

static void __printNum(double d) {
    if (d == (long long)d) printf("%lld", (long long)d);
    else printf("%g", d);
}

${studentCode}

int main() {
    char* buf = (char*)malloc(1024 * 1024);
    int len = 0;
    int c;
    while ((c = getchar()) != EOF) buf[len++] = (char)c;
    buf[len] = '\\0';
    __src = buf;
    __pos = 0;
    JsonValue __parsed = __parseValue();

${decls.join("\n")}
    ${resultDecl}
    ${printStmt}
    return 0;
}
`;
}
