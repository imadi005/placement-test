import { FunctionSignature, ParamType } from "./harness-types";

// Same idea as the Java harness: Judge0's plain g++ has no JSON library
// available, so this bundles a minimal recursive-descent parser for our
// small ParamType grammar (numbers/strings/bools/1D-vectors only). The
// student writes just the function (matching the declared signature,
// `vector<int>`/`string`/etc. for array/string types) — nothing here
// parses or validates that function, it's concatenated verbatim.
const CAST_FN: Record<ParamType, string> = {
  int: "__asInt",
  double: "__asDouble",
  boolean: "__asBool",
  string: "__asString",
  "int[]": "__asIntVec",
  "double[]": "__asDoubleVec",
  "string[]": "__asStringVec",
  "boolean[]": "__asBoolVec",
};

export function buildCppSource(signature: FunctionSignature, studentCode: string): string {
  // Assigned to named locals (not passed as inline temporaries) because a
  // student writing the idiomatic `vector<int>& nums` signature (non-const
  // reference — the natural style, and what real LeetCode C++ stubs use)
  // can't bind that to an rvalue; a named local is an lvalue and works
  // whether the student's parameter is by value, const ref, or non-const ref.
  const argDecls = signature.parameters
    .map((p, i) => `    auto __a${i} = ${CAST_FN[p.type]}(__parsed.arr[${i}]);`)
    .join("\n");
  const argNames = signature.parameters.map((_, i) => `__a${i}`).join(", ");

  return `#include <bits/stdc++.h>
using namespace std;

struct JsonValue {
    enum Type { NUM, STR, BOOL, ARR } type;
    double num = 0;
    string str;
    bool boolean = false;
    vector<JsonValue> arr;
};

static string __src;
static int __pos;

static void __skipWs() { while (__pos < (int)__src.size() && isspace((unsigned char)__src[__pos])) __pos++; }

JsonValue __parseValue();

JsonValue __parseArray() {
    JsonValue v; v.type = JsonValue::ARR;
    __pos++;
    __skipWs();
    if (__src[__pos] == ']') { __pos++; return v; }
    while (true) {
        v.arr.push_back(__parseValue());
        __skipWs();
        if (__src[__pos] == ',') { __pos++; __skipWs(); continue; }
        if (__src[__pos] == ']') { __pos++; break; }
    }
    return v;
}

JsonValue __parseString() {
    JsonValue v; v.type = JsonValue::STR;
    __pos++;
    string s;
    while (__src[__pos] != '"') {
        char c = __src[__pos];
        if (c == '\\\\') {
            __pos++;
            char esc = __src[__pos];
            if (esc == 'n') s += '\\n';
            else if (esc == 't') s += '\\t';
            else s += esc;
        } else {
            s += c;
        }
        __pos++;
    }
    __pos++;
    v.str = s;
    return v;
}

JsonValue __parseBool() {
    JsonValue v; v.type = JsonValue::BOOL;
    if (__src.compare(__pos, 4, "true") == 0) { v.boolean = true; __pos += 4; }
    else { v.boolean = false; __pos += 5; }
    return v;
}

JsonValue __parseNumber() {
    JsonValue v; v.type = JsonValue::NUM;
    int start = __pos;
    while (__pos < (int)__src.size() && (isdigit((unsigned char)__src[__pos]) || strchr("-+.eE", __src[__pos]))) __pos++;
    v.num = stod(__src.substr(start, __pos - start));
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

static int __asInt(const JsonValue& v) { return (int)v.num; }
static double __asDouble(const JsonValue& v) { return v.num; }
static bool __asBool(const JsonValue& v) { return v.boolean; }
static string __asString(const JsonValue& v) { return v.str; }
static vector<int> __asIntVec(const JsonValue& v) { vector<int> r; for (auto& e : v.arr) r.push_back((int)e.num); return r; }
static vector<double> __asDoubleVec(const JsonValue& v) { vector<double> r; for (auto& e : v.arr) r.push_back(e.num); return r; }
static vector<string> __asStringVec(const JsonValue& v) { vector<string> r; for (auto& e : v.arr) r.push_back(e.str); return r; }
static vector<bool> __asBoolVec(const JsonValue& v) { vector<bool> r; for (auto& e : v.arr) r.push_back(e.boolean); return r; }

static string __numToJson(double d) {
    if (d == floor(d) && !isinf(d)) return to_string((long long)d);
    ostringstream oss; oss << d; return oss.str();
}

static string __toJson(int v) { return to_string(v); }
static string __toJson(double v) { return __numToJson(v); }
static string __toJson(bool v) { return v ? "true" : "false"; }
static string __toJson(const string& v) { return "\\"" + v + "\\""; }
static string __toJson(const vector<int>& v) {
    string s = "[";
    for (size_t i = 0; i < v.size(); i++) { if (i) s += ","; s += to_string(v[i]); }
    return s + "]";
}
static string __toJson(const vector<double>& v) {
    string s = "[";
    for (size_t i = 0; i < v.size(); i++) { if (i) s += ","; s += __numToJson(v[i]); }
    return s + "]";
}
static string __toJson(const vector<string>& v) {
    string s = "[";
    for (size_t i = 0; i < v.size(); i++) { if (i) s += ","; s += "\\"" + v[i] + "\\""; }
    return s + "]";
}
static string __toJson(const vector<bool>& v) {
    string s = "[";
    for (size_t i = 0; i < v.size(); i++) { if (i) s += ","; s += (v[i] ? "true" : "false"); }
    return s + "]";
}

${studentCode}

int main() {
    ostringstream __ss;
    __ss << cin.rdbuf();
    __src = __ss.str();
    __pos = 0;
    JsonValue __parsed = __parseValue();
${argDecls}
    auto __result = ${signature.functionName}(${argNames});
    cout << __toJson(__result) << endl;
    return 0;
}
`;
}
