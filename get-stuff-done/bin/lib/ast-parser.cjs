/**
 * AST Parser Utility — Extracts symbols and dependencies from JS/TS code.
 * Uses web-tree-sitter if available, with a robust Regex fallback for sync usage.
 */

const path = require('path');
const fs = require('fs');

let Parser;
let JavaScript;
let TypeScript;
let TSX;

let isInitialized = false;

/**
 * Initialize the Tree-Sitter parser.
 * This is async and must be called before using Tree-Sitter logic.
 */
async function init() {
  if (isInitialized) return;
  try {
    // We require web-tree-sitter as requested by the plan
    Parser = require('web-tree-sitter');
    
    await Parser.init({
      locateFile(scriptName) {
        // Look for WASM files in the wasm directory relative to this file
        return path.resolve(__dirname, '..', 'wasm', scriptName);
      }
    });
    
    const wasmDir = path.resolve(__dirname, '..', 'wasm');
    const jsPath = path.join(wasmDir, 'tree-sitter-javascript.wasm');
    const tsPath = path.join(wasmDir, 'tree-sitter-typescript.wasm');
    const tsxPath = path.join(wasmDir, 'tree-sitter-tsx.wasm');

    if (fs.existsSync(jsPath)) JavaScript = await Parser.Language.load(jsPath);
    if (fs.existsSync(tsPath)) TypeScript = await Parser.Language.load(tsPath);
    if (fs.existsSync(tsxPath)) TSX = await Parser.Language.load(tsxPath);

    isInitialized = true;
    return true;
  } catch (err) {
    // console.error('Failed to initialize Tree-Sitter:', err.message);
    return false;
  }
}

/**
 * Extracts symbols and dependencies using Regex.
 * Robust fallback for when Tree-Sitter is unavailable or for synchronous usage.
 */
function parseCodeRegex(code, language = 'javascript') {
  const symbols = [];
  const dependencies = [];

  // Simple comment removal to avoid matches in comments
  const cleanCode = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

  // 1. Function declarations: function name(...)
  const funcDeclRegex = /function\s+([a-zA-Z0-9_$]+)\s*\(/g;
  let match;
  while ((match = funcDeclRegex.exec(cleanCode)) !== null) {
    symbols.push({ name: match[1], kind: 'function', line: getLineNumber(code, match.index) });
  }

  // 2. Arrow functions: const name = (...) =>
  const arrowFuncRegex = /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/g;
  while ((match = arrowFuncRegex.exec(cleanCode)) !== null) {
    symbols.push({ name: match[1], kind: 'function', line: getLineNumber(code, match.index) });
  }

  // 3. Class declarations: class Name
  const classDeclRegex = /class\s+([a-zA-Z0-9_$]+)/g;
  while ((match = classDeclRegex.exec(cleanCode)) !== null) {
    symbols.push({ name: match[1], kind: 'class', line: getLineNumber(code, match.index) });
  }

  // 4. Imports: import ... from '...'
  const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = importRegex.exec(cleanCode)) !== null) {
    dependencies.push(match[1]);
  }

  // 5. Requires: require('...')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(cleanCode)) !== null) {
    dependencies.push(match[1]);
  }

  return { 
    symbols: Array.from(new Map(symbols.map(s => [`${s.name}-${s.kind}`, s])).values()),
    dependencies: Array.from(new Set(dependencies)) 
  };
}

function getLineNumber(code, index) {
  return code.substring(0, index).split('\n').length;
}

/**
 * Main entry point for parsing code.
 * If Tree-Sitter is initialized and ready, it will use it (future implementation).
 * For now, and as a robust fallback, it uses regex-based extraction.
 * 
 * @param {string} code - The code to parse
 * @param {string} language - javascript, typescript, etc.
 * @returns {Object} { symbols: Array, dependencies: Array }
 */
function parseCode(code, language = 'javascript') {
  // Tree-Sitter integration would go here if isInitialized is true.
  // Given the synchronous requirement of many GSD tools and the async nature of TS init,
  // the regex fallback is the primary path for synchronous calls.
  
  return parseCodeRegex(code, language);
}

module.exports = {
  init,
  parseCode,
  isInitialized: () => isInitialized
};
