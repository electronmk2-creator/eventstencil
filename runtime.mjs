/** EventStencil: local, observed-shape JSON comparison. No DOM or network calls. */
export const LIMITS = Object.freeze({ maxBytes: 2 * 1024 * 1024, maxDepth: 60, maxKeys: 20000, maxPatterns: 128, maxPatternLength: 512, maxArrayVariants: 128, maxWork: 1000000 });
export const DEFAULT_REDACTION_KEYS = Object.freeze(['password', 'passwd', 'secret', 'token', 'access_token', 'refresh_token', 'authorization', 'api_key', 'apikey', 'email']);
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const kind = (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const escapePointer = (value) => String(value).replace(/~/gu, '~0').replace(/\//gu, '~1');
const childPath = (path, key) => `${path}/${escapePointer(key)}`;
const bytes = (value) => new TextEncoder().encode(value).byteLength;

function fail(message, path = '') {
  const error = new Error(message);
  error.name = 'PayloadError';
  error.path = path;
  throw error;
}

// Size alone cannot bound array-union matching: every candidate could try every
// observed shape, recursively. Refuse expensive work instead of freezing a tab.
function workBudget(label) {
  let remaining = LIMITS.maxWork;
  return (units = 1, path = '') => {
    // Long shared ancestor names otherwise amplify into enormous issue paths
    // and repeated pointer decoding even when the input itself is small.
    remaining -= units + Math.ceil(path.length / 32);
    if (remaining < 0) fail(`${label} exceeded the complexity limit. Reduce array variants, path patterns, or payload size.`, path);
  };
}

function inspect(value) {
  let keys = 0;
  let size = 0;
  let fields = 0;
  const seen = new WeakSet();
  function visit(item, path, depth) {
    if (depth > LIMITS.maxDepth) fail(`Payload nesting exceeds ${LIMITS.maxDepth} levels.`, path);
    const type = kind(item);
    if (type === 'string') size += bytes(item) + 2;
    else if (type === 'number') {
      if (!Number.isFinite(item)) fail('Only finite JSON numbers are supported.', path);
      size += String(item).length;
    } else if (type === 'boolean' || type === 'null') size += 5;
    else if (type === 'array' || type === 'object') {
      if (type === 'object') {
        const prototype = Object.getPrototypeOf(item);
        if (prototype !== Object.prototype && prototype !== null) fail('Only plain JSON objects are supported.', path);
      }
      if (seen.has(item)) fail('Circular payloads are not supported.', path);
      seen.add(item);
      if (Array.isArray(item) && item.length > LIMITS.maxKeys) fail('The payload array is too large.', path);
      for (const key of Reflect.ownKeys(item)) {
        if (type === 'array' && key === 'length') continue;
        if (typeof key !== 'string' || RESERVED.has(key)) fail('Reserved property names (__proto__, constructor, prototype) are not supported.', path);
        if (type === 'array' && !/^(?:0|[1-9]\d*)$/u.test(key)) fail('Arrays must contain only indexed JSON values.', path);
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !own(descriptor, 'value')) fail('Getters and setters are not supported.', path);
        keys += 1;
        if (keys > LIMITS.maxKeys) fail(`Payloads may contain at most ${LIMITS.maxKeys} keys and array entries.`, path);
        if (type === 'object') fields += 1;
        size += bytes(key) + 4;
        visit(descriptor.value, childPath(path, key), depth + 1);
      }
      // Sparse JS arrays are not JSON values; JSON.parse never creates them.
      if (type === 'array' && Object.keys(item).length !== item.length) fail('Sparse arrays are not supported.', path);
      seen.delete(item);
    } else fail('Only JSON values are supported.', path);
    if (size > LIMITS.maxBytes * 2) fail('Payload content exceeds the supported size.', path);
  }
  visit(value, '', 0);
  return fields;
}

/** Parse strict JSON up to 2 MiB UTF-8. Reserved prototype-related keys are refused. */
export function parsePayload(text) {
  if (typeof text !== 'string') fail('Enter or choose a JSON text payload.');
  if (text.length > LIMITS.maxBytes || bytes(text) > LIMITS.maxBytes) fail('Each JSON payload must be 2 MiB or smaller.');
  if (!text.trim()) fail('The JSON payload is empty.');
  let value;
  try { value = JSON.parse(text); } catch (error) { fail(`Invalid JSON: ${error.message}`); }
  inspect(value);
  return value;
}

function patterns(input = [], label = 'paths') {
  if (!Array.isArray(input) || input.length > LIMITS.maxPatterns) fail(`${label} must be an array of at most ${LIMITS.maxPatterns} JSON Pointer patterns.`);
  return [...new Set(input)].map((path) => {
    if (typeof path !== 'string' || path.length > LIMITS.maxPatternLength || (path !== '' && !path.startsWith('/')) || /~(?![01])/u.test(path)) {
      fail(`${label} must use valid JSON Pointers (for example /items/*/id).`);
    }
    const segments = path === '' ? [] : path.slice(1).split('/').map((part) => part.replace(/~1/gu, '/').replace(/~0/gu, '~'));
    if (segments.some((part) => part.includes('*') && part !== '*')) fail('A wildcard must be a complete path segment.');
    return { path, segments };
  });
}

function ignored(path, compiled, consume) {
  if (compiled.length === 0) return false;
  const actual = path === '' ? [] : path.slice(1).split('/').map((part) => part.replace(/~1/gu, '/').replace(/~0/gu, '~'));
  if (consume) consume(actual.length + 1, path);
  // Matching a node includes its descendants; '*' matches one path segment.
  for (const { segments } of compiled) {
    if (consume) consume(1, path);
    if (segments.length > actual.length) continue;
    let matches = true;
    for (let index = 0; index < segments.length; index += 1) {
      if (consume) consume(1, path);
      if (segments[index] !== '*' && segments[index] !== actual[index]) { matches = false; break; }
    }
    if (matches) return true;
  }
  return false;
}

function options(input = {}) {
  return { ignorePaths: patterns(input.ignorePaths ?? [], 'ignorePaths'), compareValues: input.compareValues === true, allowExtra: input.allowExtra !== false };
}

function scalarDisplay(value) {
  if (typeof value !== 'string') return value;
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

function fingerprint(value, context) {
  context.consume();
  const type = kind(value);
  if (type !== 'object' && type !== 'array') return type;
  if (context.cache.has(value)) return context.cache.get(value);
  const result = type === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${fingerprint(value[key], context)}`).join(',')}}`
    : `[${[...new Set(value.map((item) => fingerprint(item, context)))].sort().join('|')}]`;
  // Also bound repeated long shape strings in deeply nested input.
  context.consume(Math.ceil(result.length / 32));
  context.cache.set(value, result);
  return result;
}

function variants(values, context) {
  const unique = new Map();
  for (const value of values) {
    const key = fingerprint(value, context);
    if (!unique.has(key)) unique.set(key, value);
    if (unique.size > LIMITS.maxArrayVariants) fail(`An array has more than ${LIMITS.maxArrayVariants} distinct observed shapes. Split this sample before comparing.`);
  }
  return [...unique.values()];
}

/**
 * Compare observed structure, not a provider's authoritative contract. Object
 * fields seen in a baseline object are required; null is a type, not optional.
 * Array items may match ANY shape observed across ALL baseline elements.
 * Array length differences are informational, or warnings in value mode.
 * Optional scalar-value comparison is index-based within arrays.
 */
export function analyzePayloads(baseline, candidate, inputOptions = {}) {
  const baselineFields = inspect(baseline);
  const candidateFields = inspect(candidate);
  const opts = options(inputOptions);
  const consume = workBudget('Comparison');
  const shapeContext = { consume, cache: new WeakMap() };
  const isIgnored = (path) => ignored(path, opts.ignorePaths, consume);
  const issues = [];
  function issue(target, path, issueKind, severity, expected, actual, message) {
    consume(1, path);
    target.push({ path, kind: issueKind, severity, expected, actual, message });
  }
  function walk(expected, actual, path, output) {
    consume(1, path);
    if (isIgnored(path)) return;
    const expectedType = kind(expected);
    const actualType = kind(actual);
    if (expectedType !== actualType) {
      issue(output, path, 'type', 'error', expectedType, actualType, `Expected ${expectedType}; observed ${actualType}.`);
      return;
    }
    if (expectedType === 'object') {
      for (const key of Object.keys(expected)) {
        consume(1, path);
        const pointer = childPath(path, key);
        if (isIgnored(pointer)) continue;
        if (!own(actual, key)) issue(output, pointer, 'missing', 'error', kind(expected[key]), 'missing', 'A field observed in the baseline is missing.');
        else walk(expected[key], actual[key], pointer, output);
      }
      for (const key of Object.keys(actual)) {
        consume(1, path);
        const pointer = childPath(path, key);
        if (!own(expected, key) && !isIgnored(pointer)) issue(output, pointer, 'added', opts.allowExtra ? 'info' : 'error', 'not present in baseline', kind(actual[key]), opts.allowExtra ? 'Additional field; allowed by the current policy.' : 'Additional fields are disallowed by the current policy.');
      }
    } else if (expectedType === 'array') {
      if (expected.length !== actual.length) issue(output, path, 'array_length', opts.compareValues ? 'warning' : 'info', expected.length, actual.length, 'Array length differs; observed samples do not establish fixed cardinality.');
      if (expected.length === 0) {
        issue(output, path, 'value', 'info', 'unobserved item shape', `${actual.length} item(s)`, 'The baseline array is empty. Only its array container type was checked; no item contract was inferred.');
        return;
      }
      const shapes = variants(expected, shapeContext);
      for (let index = 0; index < actual.length; index += 1) {
        consume(1, path);
        const pointer = childPath(path, index);
        if (isIgnored(pointer)) continue;
        let best = null;
        let bestScore = [Infinity, Infinity, Infinity];
        for (const sample of shapes) {
          consume(1, pointer);
          const attempt = [];
          walk(sample, actual[index], pointer, attempt);
          const score = [0, 0, attempt.length];
          for (const entry of attempt) {
            consume(1, pointer);
            if (entry.severity === 'error') score[0] += 1;
            else if (entry.severity === 'warning') score[1] += 1;
          }
          // Error-free branches always win, regardless of warning/info volume.
          const better = score[0] < bestScore[0] || (score[0] === bestScore[0] && (score[1] < bestScore[1] || (score[1] === bestScore[1] && score[2] < bestScore[2])));
          if (better) { best = attempt; bestScore = score; }
          if (score[2] === 0) break;
        }
        output.push(...best);
      }
    }
  }
  function values(expected, actual, path) {
    consume(1, path);
    if (isIgnored(path) || kind(expected) !== kind(actual)) return;
    if (kind(expected) === 'object') {
      for (const key of Object.keys(expected)) if (own(actual, key)) values(expected[key], actual[key], childPath(path, key));
    } else if (kind(expected) === 'array') {
      for (let index = 0; index < Math.min(expected.length, actual.length); index += 1) values(expected[index], actual[index], childPath(path, index));
    } else if (!Object.is(expected, actual)) issue(issues, path, 'value', 'warning', scalarDisplay(expected), scalarDisplay(actual), 'Scalar value differs. Value comparison is enabled; this is not a type error.');
  }
  walk(baseline, candidate, '', issues);
  if (opts.compareValues) values(baseline, candidate, '');
  const counts = { errors: 0, warnings: 0, info: 0 };
  for (const entry of issues) counts[entry.severity === 'error' ? 'errors' : entry.severity === 'warning' ? 'warnings' : 'info'] += 1;
  return { issues, passed: counts.errors === 0, counts, baselineFields, candidateFields };
}

/** Standalone JSON Schema 2020-12 inferred ONLY from observed shapes. */
export function inferContract(baseline, inputOptions = {}) {
  inspect(baseline);
  const opts = options(inputOptions);
  const consume = workBudget('Contract inference');
  const shapeContext = { consume, cache: new WeakMap() };
  function schema(value, path) {
    consume(1, path);
    if (ignored(path, opts.ignorePaths, consume)) return {};
    const type = kind(value);
    if (type === 'object') {
      // A null-prototype property map also prevents accidental assignment magic.
      const properties = Object.create(null);
      const required = [];
      for (const key of Object.keys(value)) {
        consume(1, path);
        const pointer = childPath(path, key);
        if (ignored(pointer, opts.ignorePaths, consume)) {
          // An ignored property remains allowed even in strict extra-field mode.
          properties[key] = {};
          continue;
        }
        properties[key] = schema(value[key], pointer);
        required.push(key);
      }
      let additionalProperties = opts.allowExtra;
      const current = path === '' ? [] : path.slice(1).split('/').map((part) => part.replace(/~1/gu, '/').replace(/~0/gu, '~'));
      for (const { segments } of opts.ignorePaths) {
        consume(1, path);
        if (segments.length === current.length + 1) consume(current.length, path);
        if (segments.length !== current.length + 1 || !current.every((part, index) => segments[index] === '*' || segments[index] === part)) continue;
        const child = segments[segments.length - 1];
        if (child === '*') additionalProperties = true;
        else if (!RESERVED.has(child)) properties[child] = {};
      }
      return { type: 'object', properties, required, additionalProperties };
    }
    if (type === 'array') {
      if (value.length === 0) return { type: 'array', items: {}, $comment: 'No item shape was observed in this empty baseline array.' };
      const inferred = [];
      const seen = new Set();
      for (const sample of variants(value, shapeContext)) {
        const branch = schema(sample, `${path}/*`);
        const serialized = JSON.stringify(branch);
        if (!seen.has(serialized)) { seen.add(serialized); inferred.push(branch); }
      }
      return { type: 'array', items: inferred.length === 1 ? inferred[0] : { anyOf: inferred } };
    }
    return { type };
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: 'Sample-derived observed shape, not a complete or authoritative provider contract. All observed object fields are required. Null is not optional. Unknown array items, optional fields, formats, value enums, and future event variants cannot be established from samples. Array value comparison and exact-index ignore rules are separate analysis policies, not encoded by this schema. No fixed array length is inferred.',
    ...schema(baseline, ''),
  };
}

const normalizedKey = (key) => String(key).toLocaleLowerCase('en-US').replace(/[_-]/gu, '');

/**
 * Defaults plus configured keys (case-insensitive) and pointer patterns are
 * redacted locally. Sensitive subtrees retain structure; scalar leaves become
 * '[REDACTED]', 0, false, or null. These are sanitized values, not originals.
 */
export function redactPayload(payload, { keys = [], paths = [] } = {}) {
  inspect(payload);
  if (!Array.isArray(keys) || keys.length > LIMITS.maxPatterns || keys.some((key) => typeof key !== 'string' || key.length > 120)) fail('Redaction keys must be an array of short field names.');
  const keySet = new Set([...DEFAULT_REDACTION_KEYS, ...keys].map(normalizedKey));
  const pathPatterns = patterns(paths, 'Redaction paths');
  const consume = workBudget('Redaction');
  const redactions = [];
  function copy(value, path, key, inherited = false) {
    consume(1, path);
    const redact = inherited || keySet.has(normalizedKey(key)) || ignored(path, pathPatterns, consume);
    const type = kind(value);
    if (type === 'object' || type === 'array') {
      const result = type === 'array' ? [] : Object.create(null);
      if (redact && Object.keys(value).length === 0) redactions.push({ path, key: String(key) });
      for (const child of Object.keys(value)) result[child] = copy(value[child], childPath(path, child), child, redact);
      return result;
    }
    if (!redact) return value;
    redactions.push({ path, key: String(key) });
    return type === 'string' ? '[REDACTED]' : type === 'number' ? 0 : type === 'boolean' ? false : null;
  }
  return { payload: copy(payload, '', ''), redactions };
}
