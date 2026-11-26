export type TfPrimitive = string | number | boolean;

export interface TfAttribute {
  value: TfPrimitive;
  line: number;
  raw: string;
}

export interface TfNestedBlock {
  type: string;
  line: number;
  endLine: number;
  attributes: Record<string, TfAttribute>;
}

export interface TfResource {
  type: string;
  name: string;
  line: number;
  endLine: number;
  attributes: Record<string, TfAttribute>;
  blocks: TfNestedBlock[];
  rawBody: string;
}

export interface ParsedTerraform {
  variables: Record<string, TfPrimitive>;
  resources: TfResource[];
}

/**
 * Strips `#`, `//`, `/* *\/` comments and heredocs (`<<EOF` / `<<-EOF`) while preserving
 * exact line counts and string literals.
 */
function stripCommentsAndHeredocs(input: string): string {
  const src = input.replace(/\r\n/g, '\n');
  const out: string[] = [];
  let i = 0;
  const len = src.length;

  while (i < len) {
    const ch = src[i]!;

    // String literal
    if (ch === '"') {
      out.push(ch);
      i++;
      while (i < len) {
        const c = src[i]!;
        out.push(c);
        if (c === '\\' && i + 1 < len) {
          i++;
          out.push(src[i]!);
          i++;
          continue;
        }
        i++;
        if (c === '"') {
          break;
        }
      }
      continue;
    }

    // Heredoc: <<EOF or <<-EOF
    if (ch === '<' && src[i + 1] === '<') {
      const rest = src.slice(i);
      const hdMatch = /^<<-?\s*"?([A-Za-z_][A-Za-z0-9_]*)"?[ \t]*\n/.exec(rest);
      if (hdMatch && hdMatch[1]) {
        const marker = hdMatch[1];
        const indented = rest.startsWith('<<-');
        out.push('""\n');
        i += hdMatch[0].length;
        while (i < len) {
          const lineEnd = src.indexOf('\n', i);
          const nextIdx = lineEnd === -1 ? len : lineEnd + 1;
          const lineText = src.slice(i, lineEnd === -1 ? len : lineEnd);
          const candidate = indented ? lineText.trim() : lineText;
          if (lineEnd !== -1) {
            out.push('\n');
          }
          i = nextIdx;
          if (candidate === marker) {
            break;
          }
        }
        continue;
      }
    }

    // Single-line comment # or //
    if (ch === '#' || (ch === '/' && src[i + 1] === '/')) {
      while (i < len && src[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Multi-line comment /* ... */
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < len) {
        if (src[i] === '*' && src[i + 1] === '/') {
          i += 2;
          break;
        }
        if (src[i] === '\n') {
          out.push('\n');
        }
        i++;
      }
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join('');
}

function lineAtOffset(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === '\n') {
      line++;
    }
  }
  return line;
}

function findMatchingBrace(src: string, openBraceIdx: number): number {
  let depth = 0;
  let i = openBraceIdx;
  const len = src.length;

  while (i < len) {
    const ch = src[i]!;
    if (ch === '"') {
      i++;
      while (i < len) {
        const c = src[i]!;
        if (c === '\\' && i + 1 < len) {
          i += 2;
          continue;
        }
        i++;
        if (c === '"') {
          break;
        }
      }
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
    i++;
  }
  return -1;
}

function parseLiteralOrVar(
  raw: string,
  variables: Record<string, TfPrimitive>,
): TfPrimitive | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  const varMatch = /^var\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
  if (varMatch && varMatch[1] && variables[varMatch[1]] !== undefined) {
    return variables[varMatch[1]];
  }
  return undefined;
}

function parseBody(
  body: string,
  baseLine: number,
  variables: Record<string, TfPrimitive>,
): { attributes: Record<string, TfAttribute>; blocks: TfNestedBlock[] } {
  const attributes: Record<string, TfAttribute> = {};
  const blocks: TfNestedBlock[] = [];

  let i = 0;
  const len = body.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(body[i]!)) {
      i++;
    }
    if (i >= len) {
      break;
    }

    const lineStart = baseLine + lineAtOffset(body, i) - 1;
    const rest = body.slice(i);

    // Nested block: <ident> ["label"] { ... }
    const blockMatch = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+"[^"]*")*\s*\{/.exec(rest);
    if (blockMatch && blockMatch[1]) {
      const openIdx = i + blockMatch[0].length - 1;
      const closeIdx = findMatchingBrace(body, openIdx);
      if (closeIdx === -1) {
        break;
      }
      const inner = body.slice(openIdx + 1, closeIdx);
      const innerBaseLine = baseLine + lineAtOffset(body, openIdx + 1) - 1;
      const nested = parseBody(inner, innerBaseLine, variables);
      blocks.push({
        type: blockMatch[1],
        line: lineStart,
        endLine: baseLine + lineAtOffset(body, closeIdx) - 1,
        attributes: nested.attributes,
      });
      i = closeIdx + 1;
      continue;
    }

    // Attribute: key = value (to end of line, or skip balanced brackets/braces if multiline)
    const attrMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/.exec(rest);
    if (attrMatch && attrMatch[1]) {
      const key = attrMatch[1];
      let valStart = i + attrMatch[0].length;
      // If value starts with { or [, skip until balanced
      let valEnd = valStart;
      let bracketDepth = 0;
      let braceDepth = 0;
      let inStr = false;

      while (valEnd < len) {
        const c = body[valEnd]!;
        if (inStr) {
          if (c === '\\' && valEnd + 1 < len) {
            valEnd += 2;
            continue;
          }
          if (c === '"') {
            inStr = false;
          }
          valEnd++;
          continue;
        }
        if (c === '"') {
          inStr = true;
          valEnd++;
          continue;
        }
        if (c === '[') bracketDepth++;
        else if (c === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        else if (c === '{') braceDepth++;
        else if (c === '}') braceDepth = Math.max(0, braceDepth - 1);
        else if (c === '\n' && bracketDepth === 0 && braceDepth === 0) {
          break;
        }
        valEnd++;
      }

      const rawVal = body.slice(valStart, valEnd).trim();
      const parsedVal = parseLiteralOrVar(rawVal, variables);
      if (parsedVal !== undefined) {
        attributes[key] = {
          value: parsedVal,
          line: lineStart,
          raw: rawVal,
        };
      }
      i = valEnd + 1;
      continue;
    }

    // Advance to next line if unrecognized token
    const nextNl = body.indexOf('\n', i);
    if (nextNl === -1) {
      break;
    }
    i = nextNl + 1;
  }

  return { attributes, blocks };
}

/**
 * Tolerant regex/brace-based Terraform HCL parser for `.tf` files.
 */
export function parseTerraform(content: string): ParsedTerraform {
  const clean = stripCommentsAndHeredocs(content);
  const variables: Record<string, TfPrimitive> = {};
  const resources: TfResource[] = [];

  // Pass 1: extract variable defaults
  const varRe = /\bvariable\s+"([A-Za-z_][A-Za-z0-9_-]*)"\s*\{/g;
  let vm: RegExpExecArray | null;
  while ((vm = varRe.exec(clean)) !== null) {
    const varName = vm[1];
    const openIdx = vm.index + vm[0].length - 1;
    const closeIdx = findMatchingBrace(clean, openIdx);
    if (closeIdx === -1 || !varName) {
      continue;
    }
    const body = clean.slice(openIdx + 1, closeIdx);
    const parsed = parseBody(body, lineAtOffset(clean, openIdx + 1), {});
    if (parsed.attributes.default !== undefined) {
      variables[varName] = parsed.attributes.default.value;
    }
  }

  // Pass 2: extract resource blocks
  const resRe = /\bresource\s+"([A-Za-z0-9_]+)"\s+"([A-Za-z0-9_-]+)"\s*\{/g;
  let rm: RegExpExecArray | null;
  while ((rm = resRe.exec(clean)) !== null) {
    const type = rm[1];
    const name = rm[2];
    const openIdx = rm.index + rm[0].length - 1;
    const closeIdx = findMatchingBrace(clean, openIdx);
    if (closeIdx === -1 || !type || !name) {
      continue;
    }
    const body = clean.slice(openIdx + 1, closeIdx);
    const baseLine = lineAtOffset(clean, openIdx + 1);
    const parsed = parseBody(body, baseLine, variables);

    resources.push({
      type,
      name,
      line: lineAtOffset(clean, rm.index),
      endLine: lineAtOffset(clean, closeIdx),
      attributes: parsed.attributes,
      blocks: parsed.blocks,
      rawBody: body,
    });
  }

  return { variables, resources };
}
