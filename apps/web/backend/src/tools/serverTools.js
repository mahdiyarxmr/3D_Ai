import { ToolRegistry, EXECUTION_SCOPE } from './registry.js';

/**
 * Built-in server-side tools.
 *
 * These are deliberately small, side-effect free and safe to expose to a model:
 * they read the server clock and evaluate arithmetic. Anything that would touch
 * a user's machine is impossible to register (see ToolRegistry).
 */
export function createDefaultRegistry() {
  const registry = new ToolRegistry();

  registry.register({
    name: 'server_time',
    description: 'Return the current UTC date and time of the LunaAI Web server.',
    scope: EXECUTION_SCOPE.SERVER,
    risk: 'low',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => ({ utc: new Date().toISOString() }),
  });

  registry.register({
    name: 'calculate',
    description: 'Evaluate a basic arithmetic expression (+, -, *, /, parentheses, decimals).',
    scope: EXECUTION_SCOPE.SERVER,
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Arithmetic expression, e.g. "12 * (3 + 4)"' },
      },
      required: ['expression'],
      additionalProperties: false,
    },
    handler: async ({ expression }) => {
      if (typeof expression !== 'string' || expression.length > 200) {
        throw new Error('invalid_expression');
      }
      return { result: evaluateArithmetic(expression) };
    },
  });

  return registry;
}

/** Tiny recursive-descent parser: no eval(), no identifiers, no function calls. */
export function evaluateArithmetic(input) {
  const text = String(input).replace(/\s+/g, '');
  let pos = 0;

  const peek = () => text[pos];
  const eat = (ch) => {
    if (text[pos] !== ch) throw new Error('invalid_expression');
    pos += 1;
  };

  function parseExpression() {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = text[pos++];
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = text[pos++];
      const rhs = parseFactor();
      if (op === '/') {
        if (rhs === 0) throw new Error('division_by_zero');
        value /= rhs;
      } else {
        value *= rhs;
      }
    }
    return value;
  }

  function parseFactor() {
    if (peek() === '-') {
      pos += 1;
      return -parseFactor();
    }
    if (peek() === '+') {
      pos += 1;
      return parseFactor();
    }
    if (peek() === '(') {
      eat('(');
      const value = parseExpression();
      eat(')');
      return value;
    }
    const start = pos;
    while (pos < text.length && /[0-9.]/.test(text[pos])) pos += 1;
    if (start === pos) throw new Error('invalid_expression');
    const value = Number(text.slice(start, pos));
    if (!Number.isFinite(value)) throw new Error('invalid_expression');
    return value;
  }

  const result = parseExpression();
  if (pos !== text.length) throw new Error('invalid_expression');
  return result;
}
