/**
 * A small syntax highlighter for code blocks in chat replies.
 *
 * Like the Markdown renderer, it never parses the code as HTML: it splits the text into tokens
 * and wraps each in a `<span data-token="…">` filled with a text node. Colours come from CSS.
 *
 * It colours by pattern, not by parsing, so it's quick enough to rerun on every frame while a
 * reply streams in, and an unfinished string or comment simply runs to the end.
 */

/** Turns code into DOM nodes, or returns null to show it plain. */
export type Highlighter = (code: string, language: string) => Node[] | null;

/** The token names used for `data-token`. */
export type TokenKind =
  | "comment"
  | "string"
  | "keyword"
  | "builtin"
  | "number"
  | "type"
  | "function"
  | "property"
  | "tag"
  | "attribute"
  | "variable"
  | "inserted"
  | "deleted";

type Grammar = { rules: [TokenKind, string][]; flags?: string };

/** Longer code is shown plain, so a huge paste can't slow the page. */
const maxLength = 50_000;

// Shared pieces. Unfinished strings and comments run to the end, as they do mid-stream.
const end = String.raw`(?![\s\S])`;
const doubleQuoted = String.raw`"(?:\\[\s\S]|[^\\"\n])*"?`;
const singleQuoted = String.raw`'(?:\\[\s\S]|[^\\'\n])*'?`;
const backtick = String.raw`\x60(?:\\[\s\S]|[^\\\x60])*\x60?`;
const blockComment = String.raw`\/\*[\s\S]*?(?:\*\/|${end})`;
const number = String.raw`\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?n?)\b|(?<![\w.])\.\d+\b`;
const words = (list: string) => String.raw`\b(?:${list.trim().split(/\s+/).join("|")})\b`;

const javascriptKeywords = `
  as async await break case catch class const continue debugger default delete do else export extends
  finally for from function get if import in instanceof let new of return set static super switch this
  throw try typeof var void while with yield`;
const typescriptKeywords = `${javascriptKeywords}
  abstract declare enum implements infer interface is keyof namespace private protected public readonly
  satisfies type`;

const javascript = (keywords: string): Grammar => ({
  rules: [
    ["comment", String.raw`\/\/[^\n]*|${blockComment}`],
    ["string", `${backtick}|${doubleQuoted}|${singleQuoted}`],
    ["keyword", words(keywords)],
    ["builtin", words("true false null undefined NaN Infinity")],
    ["number", number],
    ["type", String.raw`\b[A-Z][\w$]*\b`],
    ["function", String.raw`[A-Za-z_$][\w$]*(?=\s*\()`],
  ],
});

const grammars: Record<string, Grammar> = {
  javascript: javascript(javascriptKeywords),
  typescript: javascript(typescriptKeywords),
  json: {
    rules: [
      ["comment", String.raw`\/\/[^\n]*|${blockComment}`],
      ["property", String.raw`"(?:\\.|[^\\"\n])*"(?=\s*:)`],
      ["string", doubleQuoted],
      ["builtin", words("true false null")],
      ["number", String.raw`-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`],
    ],
  },
  markup: {
    rules: [
      ["comment", String.raw`<!--[\s\S]*?(?:-->|${end})`],
      ["keyword", String.raw`<![A-Za-z][^>]*>?`],
      ["tag", String.raw`<\/?[A-Za-z][\w:.-]*|\/?>`],
      ["attribute", String.raw`(?<=\s)[^\s=<>"'\/]+(?=\s*=)`],
      ["string", String.raw`(?<==\s*)(?:"[^"]*"?|'[^']*'?)`],
      ["builtin", String.raw`&(?:#\d+|#x[\da-fA-F]+|\w+);`],
    ],
  },
  css: {
    rules: [
      ["comment", blockComment],
      ["string", `${doubleQuoted}|${singleQuoted}`],
      ["keyword", String.raw`@[\w-]+|!important\b`],
      ["variable", String.raw`--[\w-]+`],
      ["function", String.raw`[\w-]+(?=\()`],
      ["property", String.raw`(?<![\w-])[a-z-]+(?=\s*:(?!:)[^{};]*(?:;|\}|${end}))`],
      ["number", String.raw`#[\da-fA-F]{3,8}\b|(?<![\w-])-?\d*\.?\d+(?:%|[a-zA-Z]+)?`],
    ],
  },
  shell: {
    rules: [
      ["comment", String.raw`(?<![^\s])#[^\n]*|^[ \t]*\$(?=[ \t])`],
      ["string", String.raw`"(?:\\[\s\S]|[^\\"])*"?|'[^']*'?`],
      ["variable", String.raw`\$(?:\{[^}\n]*\}|[A-Za-z_]\w*|[0-9@#?*!$-])`],
      [
        "keyword",
        words("if then else elif fi for while until do done case esac in function select return export local readonly unset source alias set shift exit"),
      ],
      ["function", String.raw`(?<=^[ \t]*(?:\$[ \t]+)?|[|;&(][ \t]*)[A-Za-z_./~][\w./~+-]*`],
      ["attribute", String.raw`(?<=\s)--?[A-Za-z][\w-]*`],
    ],
  },
  python: {
    rules: [
      ["comment", String.raw`#[^\n]*`],
      [
        "string",
        String.raw`(?:\b[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|${end})|'''[\s\S]*?(?:'''|${end})|"(?:\\.|[^\\"\n])*"?|'(?:\\.|[^\\'\n])*'?)`,
      ],
      ["attribute", String.raw`^[ \t]*@[\w.]+`],
      [
        "keyword",
        words(
          "and as assert async await break class continue def del elif else except finally for from global if import in is lambda match case nonlocal not or pass raise return try while with yield",
        ),
      ],
      ["builtin", words("True False None self cls")],
      ["number", number],
      ["type", String.raw`\b[A-Z][A-Za-z0-9_]*\b`],
      ["function", String.raw`\b[A-Za-z_]\w*(?=\s*\()`],
    ],
  },
  sql: {
    flags: "i",
    rules: [
      ["comment", String.raw`--[^\n]*|${blockComment}`],
      ["string", String.raw`'(?:''|[^'])*'?`],
      [
        "keyword",
        words(`
          select from where and or not insert into values update set delete create table index view drop alter add
          column primary key foreign references join left right inner outer full cross on as group by order having
          limit offset union all distinct case when then else end is null in between like ilike exists asc desc with
          returning default unique check constraint if begin commit rollback transaction`),
      ],
      ["builtin", words("true false")],
      [
        "type",
        words(
          "int integer bigint smallint serial text varchar char boolean bool date time timestamp timestamptz numeric decimal real float double json jsonb uuid blob",
        ),
      ],
      ["function", String.raw`\b[A-Za-z_]\w*(?=\s*\()`],
      ["number", String.raw`\b\d+(?:\.\d+)?\b`],
    ],
  },
  diff: {
    rules: [
      ["comment", String.raw`^(?:diff |index |---|\+\+\+)[^\n]*`],
      ["keyword", String.raw`^@@[^\n]*`],
      ["inserted", String.raw`^\+[^\n]*`],
      ["deleted", String.raw`^-[^\n]*`],
    ],
  },
  yaml: {
    rules: [
      ["comment", String.raw`(?<![^\s])#[^\n]*`],
      ["keyword", String.raw`^(?:---|\.\.\.)[ \t]*$`],
      ["property", String.raw`(?<=^[ \t]*(?:-[ \t]+)?)[\w.-]+(?=[ \t]*:(?:[ \t]|$))`],
      ["string", `${doubleQuoted}|${singleQuoted}`],
      ["builtin", words("true false null yes no on off")],
      ["number", String.raw`(?<![\w.-])-?\d+(?:\.\d+)?\b`],
    ],
  },
  toml: {
    rules: [
      ["comment", String.raw`#[^\n]*`],
      ["type", String.raw`^[ \t]*\[\[?[^\]\n]+\]\]?`],
      ["property", String.raw`(?<=^[ \t]*)[\w.-]+(?=[ \t]*=)`],
      ["string", String.raw`"""[\s\S]*?(?:"""|${end})|${doubleQuoted}|${singleQuoted}`],
      ["builtin", words("true false")],
      ["number", String.raw`(?<![\w.-])[+-]?\d[\d_]*(?:\.\d+)?\b`],
    ],
  },
};

const aliases: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  node: "javascript",
  ts: "typescript",
  typescript: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  json: "json",
  jsonc: "json",
  json5: "json",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  xhtml: "markup",
  vue: "markup",
  css: "css",
  scss: "css",
  less: "css",
  sh: "shell",
  bash: "shell",
  shell: "shell",
  zsh: "shell",
  console: "shell",
  terminal: "shell",
  py: "python",
  python: "python",
  python3: "python",
  sql: "sql",
  postgres: "sql",
  postgresql: "sql",
  mysql: "sql",
  sqlite: "sql",
  diff: "diff",
  patch: "diff",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
};

/** The language names and aliases the built-in highlighter knows. */
export const highlightedLanguages = Object.keys(aliases);

const compiled = new Map<string, RegExp>();

function pattern(name: string, grammar: Grammar) {
  let regex = compiled.get(name);
  if (!regex) {
    // One named group per rule, so a match says which rule it came from.
    const source = grammar.rules.map(([, rule], index) => `(?<t${index}>${rule})`).join("|");
    regex = new RegExp(source, `gm${grammar.flags ?? ""}`);
    compiled.set(name, regex);
  }
  return regex;
}

/** The built-in highlighter: colours the languages in `highlightedLanguages`, and returns null for others. */
export const highlight: Highlighter = (code, language) => {
  const name = aliases[language.trim().toLowerCase()];
  if (!name || code.length > maxLength) return null;
  const grammar = grammars[name];
  const nodes: Node[] = [];
  let last = 0;
  for (const match of code.matchAll(pattern(name, grammar))) {
    if (!match[0]) continue;
    const index = grammar.rules.findIndex((_, rule) => match.groups![`t${rule}`] !== undefined);
    if (match.index! > last) nodes.push(document.createTextNode(code.slice(last, match.index)));
    const token = document.createElement("span");
    token.dataset.token = grammar.rules[index][0];
    token.textContent = match[0];
    nodes.push(token);
    last = match.index! + match[0].length;
  }
  if (last < code.length) nodes.push(document.createTextNode(code.slice(last)));
  return nodes;
};
