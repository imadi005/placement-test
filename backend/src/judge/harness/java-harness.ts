import { FunctionSignature, ParamType } from "./harness-types";

// Java has no JSON library in Judge0's default classpath, so this bundles a
// small hand-rolled parser (numbers/strings/bools/1D-arrays only — matches
// our deliberately small ParamType grammar) rather than assuming one's
// available. The student's code must be exactly a `class Solution { ... }`
// (no `public` modifier — Java only allows one public type per file, and
// `Main` below is that one) containing just the method matching the
// declared signature; nothing here parses or validates that method itself,
// it's concatenated verbatim and called by name.
const CAST_FN: Record<ParamType, string> = {
  int: "__asInt",
  double: "__asDouble",
  boolean: "__asBoolean",
  string: "__asString",
  "int[]": "__asIntArray",
  "double[]": "__asDoubleArray",
  "string[]": "__asStringArray",
  "boolean[]": "__asBooleanArray",
};

export function buildJavaSource(signature: FunctionSignature, studentCode: string): string {
  const argExprs = signature.parameters.map((p, i) => `${CAST_FN[p.type]}(__parsed.get(${i}))`).join(", ");

  return `import java.util.*;

${studentCode}

public class Main {
    private static String __src;
    private static int __pos;

    private static void __skipWs() {
        while (__pos < __src.length() && Character.isWhitespace(__src.charAt(__pos))) __pos++;
    }

    private static Object __parseValue() {
        __skipWs();
        char c = __src.charAt(__pos);
        if (c == '[') return __parseArray();
        if (c == '"') return __parseString();
        if (c == 't' || c == 'f') return __parseBool();
        return __parseNumber();
    }

    private static List<Object> __parseArray() {
        List<Object> list = new ArrayList<>();
        __pos++;
        __skipWs();
        if (__src.charAt(__pos) == ']') { __pos++; return list; }
        while (true) {
            list.add(__parseValue());
            __skipWs();
            char c = __src.charAt(__pos);
            if (c == ',') { __pos++; __skipWs(); continue; }
            if (c == ']') { __pos++; break; }
        }
        return list;
    }

    private static String __parseString() {
        __pos++;
        StringBuilder sb = new StringBuilder();
        while (__src.charAt(__pos) != '"') {
            char c = __src.charAt(__pos);
            if (c == '\\\\') {
                __pos++;
                char esc = __src.charAt(__pos);
                if (esc == 'n') sb.append('\\n');
                else if (esc == 't') sb.append('\\t');
                else sb.append(esc);
            } else {
                sb.append(c);
            }
            __pos++;
        }
        __pos++;
        return sb.toString();
    }

    private static Boolean __parseBool() {
        if (__src.startsWith("true", __pos)) { __pos += 4; return Boolean.TRUE; }
        __pos += 5; return Boolean.FALSE;
    }

    private static Double __parseNumber() {
        int start = __pos;
        while (__pos < __src.length() && "-+.eE0123456789".indexOf(__src.charAt(__pos)) >= 0) __pos++;
        return Double.parseDouble(__src.substring(start, __pos));
    }

    private static int __asInt(Object o) { return ((Number) o).intValue(); }
    private static double __asDouble(Object o) { return ((Number) o).doubleValue(); }
    private static boolean __asBoolean(Object o) { return (Boolean) o; }
    private static String __asString(Object o) { return (String) o; }

    @SuppressWarnings("unchecked")
    private static int[] __asIntArray(Object o) {
        List<Object> l = (List<Object>) o;
        int[] r = new int[l.size()];
        for (int i = 0; i < l.size(); i++) r[i] = __asInt(l.get(i));
        return r;
    }
    @SuppressWarnings("unchecked")
    private static double[] __asDoubleArray(Object o) {
        List<Object> l = (List<Object>) o;
        double[] r = new double[l.size()];
        for (int i = 0; i < l.size(); i++) r[i] = __asDouble(l.get(i));
        return r;
    }
    @SuppressWarnings("unchecked")
    private static String[] __asStringArray(Object o) {
        List<Object> l = (List<Object>) o;
        String[] r = new String[l.size()];
        for (int i = 0; i < l.size(); i++) r[i] = __asString(l.get(i));
        return r;
    }
    @SuppressWarnings("unchecked")
    private static boolean[] __asBooleanArray(Object o) {
        List<Object> l = (List<Object>) o;
        boolean[] r = new boolean[l.size()];
        for (int i = 0; i < l.size(); i++) r[i] = __asBoolean(l.get(i));
        return r;
    }

    private static String __toJson(Object o) {
        if (o == null) return "null";
        if (o instanceof int[]) {
            int[] a = (int[]) o;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < a.length; i++) { if (i > 0) sb.append(","); sb.append(a[i]); }
            return sb.append("]").toString();
        }
        if (o instanceof double[]) {
            double[] a = (double[]) o;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < a.length; i++) { if (i > 0) sb.append(","); sb.append(a[i]); }
            return sb.append("]").toString();
        }
        if (o instanceof boolean[]) {
            boolean[] a = (boolean[]) o;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < a.length; i++) { if (i > 0) sb.append(","); sb.append(a[i]); }
            return sb.append("]").toString();
        }
        if (o instanceof String[]) {
            String[] a = (String[]) o;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < a.length; i++) { if (i > 0) sb.append(","); sb.append("\\"").append(a[i]).append("\\""); }
            return sb.append("]").toString();
        }
        if (o instanceof String) return "\\"" + o + "\\"";
        if (o instanceof Boolean) return o.toString();
        if (o instanceof Integer) return o.toString();
        if (o instanceof Double) {
            double d = (Double) o;
            if (d == Math.floor(d) && !Double.isInfinite(d)) return String.valueOf((long) d);
            return String.valueOf(d);
        }
        return String.valueOf(o);
    }

    public static void main(String[] args) throws Exception {
        Scanner __sc = new Scanner(System.in);
        StringBuilder __sb = new StringBuilder();
        while (__sc.hasNextLine()) __sb.append(__sc.nextLine());
        __src = __sb.toString();
        __pos = 0;
        @SuppressWarnings("unchecked")
        List<Object> __parsed = (List<Object>) __parseValue();
        Solution __sol = new Solution();
        Object __result = __sol.${signature.functionName}(${argExprs});
        System.out.println(__toJson(__result));
    }
}
`;
}
