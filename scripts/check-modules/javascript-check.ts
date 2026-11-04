import type { Rule } from "eslint";
import type { Node } from "estree";
import { httpImportsRule } from "./http-import-check.ts";
import { getRuleById } from "./rule-registry.ts";
import { workflowYamlRule } from "./workflow-yaml-check.ts";
import nodePlugin from "eslint-plugin-n";

const DEPRECATED_API_RULE_IDS = [
  "text-deprecated-getYear",
  "text-deprecated-fs-F_OK",
  "text-deprecated-fs-R_OK",
  "text-deprecated-fs-W_OK",
  "text-deprecated-fs-X_OK"
];
const XMLHttpRequest_RULE_ID = "text-recommend-xmlhttprequest";
const FS_ACCESS_CONSTANTS = new Set(["F_OK", "R_OK", "W_OK", "X_OK"]);
const NODE_PROTOCOL_RULE_IDS = new Map([
  ["http", "text-recommend-http-module"],
  ["https", "text-recommend-https-module"]
]);
const nodeProtocolRule: Rule.RuleModule = nodePlugin.rules!["prefer-node-protocol"];
const httpNodeProtocolRule: Rule.RuleModule = {
  meta: {
    ...nodeProtocolRule.meta,
    messages: Object.fromEntries(Array.from(NODE_PROTOCOL_RULE_IDS, ([moduleName, id]) => [id, `${moduleName}: ${getRuleById(id)!.description}`]))
  },
  create(context) {
    return nodeProtocolRule.create(Object.create(context, {
      report: {
        value(descriptor: Rule.ReportDescriptor) {
          const source = ("node" in descriptor ? descriptor.node : null) as Node | null;
          if (source?.type !== "Literal" || typeof source.value !== "string") {
            return;
          }
          const messageId = NODE_PROTOCOL_RULE_IDS.get(source.value);
          if (!messageId) {
            return;
          }

          const parent = context.sourceCode.getAncestors(source).at(-1);
          if (parent?.type === "CallExpression" && parent.callee.type === "Identifier" && parent.callee.name === "require") {
            let scope: ReturnType<typeof context.sourceCode.getScope> | null = context.sourceCode.getScope(source);
            while (scope) {
              if (scope.set.get("require")?.defs.length) {
                return;
              }
              scope = scope.upper;
            }
          }
          context.report({ node: source, messageId, fix: descriptor.fix });
        }
      }
    }));
  }
};
const xmlHttpRequestRule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      [XMLHttpRequest_RULE_ID]: getRuleById(XMLHttpRequest_RULE_ID)!.description
    }
  },
  create(context) {
    function isShadowed(node: Node, name: string): boolean {
      let scope: ReturnType<typeof context.sourceCode.getScope> | null = context.sourceCode.getScope(node);
      while (scope) {
        if (scope.set.get(name)?.defs.length) {
          return true;
        }
        scope = scope.upper;
      }
      return false;
    }

    return {
      NewExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "XMLHttpRequest" && !isShadowed(node, "XMLHttpRequest")) {
          context.report({ node: node.callee, messageId: XMLHttpRequest_RULE_ID });
          return;
        }
        if (node.callee.type === "MemberExpression" && !node.callee.computed && node.callee.property.type === "Identifier" && node.callee.property.name === "XMLHttpRequest" && node.callee.object.type === "Identifier" && ["window", "self", "globalThis"].includes(node.callee.object.name) && !isShadowed(node, node.callee.object.name)) {
          context.report({ node: node.callee.property, messageId: XMLHttpRequest_RULE_ID });
        }
      }
    };
  }
};
type Builtin = "Date" | "date-instance" | "fs-module";

function propertyName(node: Node): string | null {
  if (node.type === "Identifier") {
    return node.name;
  }
  return node.type === "Literal" && typeof node.value === "string" ? node.value : null;
}

function moduleBuiltin(name: string): Builtin | null {
  return name === "fs" || name === "node:fs" ? "fs-module" : null;
}

const deprecatedApisRule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: Object.fromEntries(DEPRECATED_API_RULE_IDS.map(id => [id, `{{api}}: ${getRuleById(id)!.description}`]))
  },
  create(context) {
    function findVariable(node: Node, name: string) {
      let scope: ReturnType<typeof context.sourceCode.getScope> | null = context.sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(name);
        if (variable) {
          return variable;
        }
        scope = scope.upper;
      }
      return undefined;
    }

    function resolveBuiltin(node: Node | null | undefined, visited = new Set<Node>()): Builtin | null {
      if (!node || visited.has(node)) {
        return null;
      }
      visited.add(node);

      if (node.type === "ChainExpression") {
        return resolveBuiltin(node.expression, visited);
      }
      if (node.type === "NewExpression") {
        return resolveBuiltin(node.callee, visited) === "Date" ? "date-instance" : null;
      }
      if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "require"
        && node.arguments.length === 1 && !findVariable(node, "require")?.defs.length) {
        const source = node.arguments[0];
        return source.type === "Literal" && typeof source.value === "string" ? moduleBuiltin(source.value) : null;
      }
      if (node.type !== "Identifier") {
        return null;
      }

      const variable = findVariable(node, node.name);
      if (!variable?.defs.length) {
        return node.name === "Date" ? node.name : null;
      }
      if (variable.defs.length !== 1 || variable.references.some(reference => reference.isWrite() && !reference.init)) {
        return null;
      }

      const definition = variable.defs[0];
      if (definition.type === "ImportBinding" && definition.parent.type === "ImportDeclaration") {
        const builtin = moduleBuiltin(String(definition.parent.source.value));
        return definition.node.type === "ImportSpecifier" ? null : builtin;
      }
      if (definition.type === "Variable" && definition.node.type === "VariableDeclarator") {
        if (definition.node.id.type === "Identifier") {
          return resolveBuiltin(definition.node.init, visited);
        }
      }
      return null;
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || (callee.computed && callee.property.type !== "Literal")) {
          return;
        }
        if (propertyName(callee.property) === "getYear" && resolveBuiltin(callee.object) === "date-instance") {
          context.report({ node, messageId: "text-deprecated-getYear", data: { api: "Date.getYear()" } });
        }
      },
      MemberExpression(node) {
        const name = !node.computed || node.property.type === "Literal" ? propertyName(node.property) : null;
        if (name && FS_ACCESS_CONSTANTS.has(name) && resolveBuiltin(node.object) === "fs-module") {
          context.report({ node, messageId: `text-deprecated-fs-${name}`, data: { api: `fs.${name}` } });
        }
      }
    };
  }
};

export const MAGICMIRROR_PLUGIN = {
  rules: {
    "prefer-native-fetch": httpImportsRule,
    "no-xmlhttprequest": xmlHttpRequestRule,
    "no-deprecated-apis": deprecatedApisRule,
    "workflow-yaml": workflowYamlRule
  }
};

export const ESLINT_NODE_PLUGIN = {
  ...nodePlugin,
  rules: {
    ...nodePlugin.rules,
    "prefer-node-protocol": httpNodeProtocolRule
  }
};