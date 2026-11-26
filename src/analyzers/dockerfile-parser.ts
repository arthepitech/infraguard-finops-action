export interface DockerInstruction {
  instruction: string;
  args: string;
  line: number;
  endLine: number;
}

export interface DockerArg {
  name: string;
  defaultValue?: string;
  line: number;
}

export interface DockerStage {
  index: number;
  fromLine: number;
  image: string;
  alias?: string;
  platform?: string;
  instructions: DockerInstruction[];
}

export interface ParsedDockerfile {
  globalArgs: DockerArg[];
  stages: DockerStage[];
}

function parseArgValue(args: string, line: number): DockerArg | null {
  const trimmed = args.trim();
  if (!trimmed) {
    return null;
  }
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex === -1) {
    return { name: trimmed, line };
  }
  const name = trimmed.slice(0, eqIndex).trim();
  let defaultValue = trimmed.slice(eqIndex + 1).trim();
  if (
    (defaultValue.startsWith('"') && defaultValue.endsWith('"')) ||
    (defaultValue.startsWith("'") && defaultValue.endsWith("'"))
  ) {
    defaultValue = defaultValue.slice(1, -1);
  }
  return { name, defaultValue, line };
}

function parseFromArgs(args: string): { image: string; alias?: string; platform?: string } {
  const tokens = args.trim().split(/\s+/);
  let idx = 0;
  let platform: string | undefined;

  while (idx < tokens.length) {
    const tok = tokens[idx];
    if (tok && tok.startsWith('--')) {
      if (tok.toLowerCase().startsWith('--platform=')) {
        platform = tok.slice('--platform='.length);
      }
      idx++;
    } else {
      break;
    }
  }

  const image = tokens[idx] ?? '';
  let alias: string | undefined;
  const maybeAs = tokens[idx + 1];
  const maybeAlias = tokens[idx + 2];
  if (maybeAs && maybeAs.toUpperCase() === 'AS' && maybeAlias) {
    alias = maybeAlias;
  }

  return { image, alias, platform };
}

/**
 * Parses a Dockerfile into global ARGs and ordered build stages with 1-based line numbers.
 */
export function parseDockerfile(content: string): ParsedDockerfile {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let escapeChar = '\\';

  // Check for parser directive `# escape=` at the very top
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('#')) {
      const escapeMatch = /^#\s*escape\s*=\s*([\\`])$/i.exec(trimmed);
      if (escapeMatch && escapeMatch[1]) {
        escapeChar = escapeMatch[1];
      }
      continue;
    }
    break;
  }

  const instructions: DockerInstruction[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const startLine = i + 1;
    let endLine = startLine;
    const chunks: string[] = [];

    let currentLine = raw;
    while (true) {
      const trimmedEnd = currentLine.trimEnd();
      const trimmedStart = trimmedEnd.trimStart();

      if (chunks.length > 0 && trimmedStart.startsWith('#')) {
        // Comment inside a multi-line instruction is ignored
        i++;
        if (i >= lines.length) {
          break;
        }
        currentLine = lines[i] ?? '';
        endLine = i + 1;
        continue;
      }

      if (trimmedEnd.endsWith(escapeChar)) {
        chunks.push(trimmedEnd.slice(0, -1).trimStart());
        i++;
        if (i >= lines.length) {
          break;
        }
        currentLine = lines[i] ?? '';
        endLine = i + 1;
      } else {
        chunks.push(chunks.length > 0 ? trimmedStart : currentLine.trim());
        break;
      }
    }

    const combined = chunks.join(' ').trim();
    const match = /^([A-Za-z]+)\s*(.*)$/.exec(combined);
    if (match && match[1]) {
      instructions.push({
        instruction: match[1].toUpperCase(),
        args: (match[2] ?? '').trim(),
        line: startLine,
        endLine,
      });
    }

    i++;
  }

  const globalArgs: DockerArg[] = [];
  const stages: DockerStage[] = [];
  let currentStage: DockerStage | null = null;

  for (const instr of instructions) {
    if (instr.instruction === 'FROM') {
      const fromParsed = parseFromArgs(instr.args);
      currentStage = {
        index: stages.length,
        fromLine: instr.line,
        image: fromParsed.image,
        alias: fromParsed.alias,
        platform: fromParsed.platform,
        instructions: [instr],
      };
      stages.push(currentStage);
    } else if (!currentStage) {
      if (instr.instruction === 'ARG') {
        const parsedArg = parseArgValue(instr.args, instr.line);
        if (parsedArg) {
          globalArgs.push(parsedArg);
        }
      }
    } else {
      currentStage.instructions.push(instr);
    }
  }

  return { globalArgs, stages };
}
