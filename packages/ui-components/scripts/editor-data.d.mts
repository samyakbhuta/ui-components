/** Each tag's attribute names, from a module's exports: element classes, or primitives' schemas on a server. */
export function attributesOf(exports: Record<string, unknown>): Record<string, string[]>;

/** Builds VS Code's HTML custom data and JetBrains' web-types for the elements. See editor-data.mjs. */
export function buildEditorData(options: {
  /** The package folder. */
  root: string;
  /** Each tag's observedAttributes. */
  attributes: Record<string, readonly string[]>;
  version: string;
}): {
  vscode: {
    version: 1.1;
    tags: {
      name: string;
      description: { kind: "markdown"; value: string };
      attributes: { name: string; description?: { kind: "markdown"; value: string }; valueSet?: string; values?: { name: string }[] }[];
      references: { name: string; url: string }[];
    }[];
  };
  webTypes: {
    name: string;
    version: string;
    contributions: {
      html: {
        elements: {
          name: string;
          description: string;
          "doc-url": string;
          attributes: { name: string; description?: string; value: { kind: string; type?: string } }[];
          events: { name: string; description?: string; arguments: { name: string; type: string }[] }[];
        }[];
      };
    };
  };
};
