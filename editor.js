// ─────────────────────────────────────────────
//  EasyLang Editor — Interactive JS
// ─────────────────────────────────────────────

// ── Example Library ───────────────────────────
const EXAMPLES = {
  hello: `# The classic first program
say "Hello, World!"
say "Welcome to EasyLang!"`,

  arith: `# Arithmetic & variables
set a to 15
set b to 4

say "Sum: " + (a + b)
say "Difference: " + (a - b)
say "Product: " + (a * b)
say "Division: " + (a / b)
say "Remainder: " + (a % b)
say "Power: " + (a ^ 2)`,

  conditionals: `# Conditionals
set score to 85

if score >= 90
  say "Grade: A"
elseif score >= 80
  say "Grade: B"
elseif score >= 70
  say "Grade: C"
else
  say "Grade: F — study harder!"
end

set x to 7
if x % 2 == 0
  say x + " is even"
else
  say x + " is odd"
end`,

  loop: `# Loop from 1 to 10
loop i from 1 to 10
  say i
end

say "---"
# Countdown
loop i from 5 to 1
  say "T-minus " + i
end
say "Blast off!"`,

  while: `# While loop
set count to 1
while count <= 5
  say "Count: " + count
  set count to count + 1
end
say "Done!"`,

  functions: `# Functions
define greet with name
  say "Hello, " + name + "!"
end

define add with a, b
  return a + b
end

define square with n
  return n * n
end

call greet with "Alice"
call greet with "Bob"

set result to add with 10, 25
say "10 + 25 = " + result

say "7 squared = " + (square with 7)`,

  lists: `# Lists & operations
set fruits to list "apple", "banana", "cherry"
say fruits
say "Length: " + (length of fruits)
say "First: " + (first of fruits)
say "Last: " + (last of fruits)

add "mango" to fruits
say "After adding mango: " + fruits

remove "banana" from fruits
say "After removing banana: " + fruits

# Numbers
set nums to list 5, 2, 8, 1, 9, 3
say "Sorted: " + (sorted of nums)
say "Sum: " + (sum of nums)`,

  fibonacci: `# Fibonacci sequence
define fib with n
  if n <= 1
    return n
  end
  return (fib with n - 1) + (fib with n - 2)
end

say "Fibonacci sequence:"
loop i from 0 to 10
  say "fib(" + i + ") = " + (fib with i)
end`,

  fizzbuzz: `# FizzBuzz — a classic!
loop i from 1 to 20
  if i % 15 == 0
    say "FizzBuzz"
  elseif i % 3 == 0
    say "Fizz"
  elseif i % 5 == 0
    say "Buzz"
  else
    say i
  end
end`,

  factorial: `# Factorial using recursion
define factorial with n
  if n <= 1
    return 1
  end
  return n * (factorial with n - 1)
end

loop i from 1 to 10
  say i + "! = " + (factorial with i)
end`,
};

// ── DOM References ─────────────────────────────
const editor = document.getElementById('code-editor');
const outputArea = document.getElementById('output-area');
const lineNumbers = document.getElementById('line-numbers');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const runTime = document.getElementById('run-time');
const runBtn = document.getElementById('run-btn');
const promptOverlay = document.getElementById('prompt-overlay');
const promptInput = document.getElementById('prompt-input');
const promptQuestion = document.getElementById('prompt-question');

// ── Prompt (ask) state ─────────────────────────
let promptResolve = null;
let isRunning = false;

// Keep editor-specific constants namespaced to avoid clashing with language engine globals.
const EDITOR_KEYWORDS = ['set','to','say','print','if','else','elseif','end','repeat','loop','from','while','define','call','with','return','list','add','remove','and','or','not','of','in','times','do','stop','ask','true','false','null','yes','no','length','uppercase','lowercase','type','floor','ceil','round','abs','sqrt','random','first','last','reverse','sorted','sum','string','number','join'];

// ── Initialize ────────────────────────────────
function init() {
  if (!editor || !outputArea || !lineNumbers || !statusDot || !statusText || !runTime || !runBtn) {
    console.error('Editor failed to initialize: missing required DOM elements.');
    return;
  }

  // Load saved or show welcome
  const saved = getSavedCode();
  if (saved) {
    editor.value = saved;
  } else {
    editor.value = `# Welcome to EasyLang! 🎉
# Write code below and press Ctrl+Enter (or click ▶ Run)

set name to "World"
say "Hello, " + name + "!"

say "---"
say "Let's count from 1 to 5:"

loop i from 1 to 5
  say i
end

say "---"
say "EasyLang is easy!"`;
  }

  // Load from URL if available
  const urlCode = getCodeFromUrl();
  if (urlCode) editor.value = urlCode;

  updateLineNumbers();
  updateCursorPos();

  // Keyboard shortcut
  editor.addEventListener('keydown', handleKeyDown);
  editor.addEventListener('input', () => {
    updateLineNumbers();
    saveCode();
  });
  editor.addEventListener('scroll', syncScroll);
  editor.addEventListener('keyup', updateCursorPos);
  editor.addEventListener('click', updateCursorPos);
  editor.addEventListener('input', updateCursorPos);

  if (promptInput) {
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitPrompt();
    });
  }

}

function handleKeyDown(e) {
  // Ctrl+Enter → Run
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runCode();
    return;
  }
  // Tab → 2 spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    indentSelection(e.shiftKey ? -1 : 1);
  }
}

function indentSelection(direction) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const value = editor.value;

  if (start === end) {
    if (direction > 0) {
      editor.value = value.substring(0, start) + '  ' + value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
    } else {
      const before = value.substring(0, start);
      if (before.endsWith('  ')) {
        editor.value = value.substring(0, start - 2) + value.substring(end);
        editor.selectionStart = editor.selectionEnd = start - 2;
      }
    }
    updateLineNumbers();
    saveCode();
    return;
  }

  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const block = value.substring(lineStart, end);
  const lines = block.split('\n');

  let changedChars = 0;
  const updated = lines.map((line) => {
    if (direction > 0) {
      changedChars += 2;
      return '  ' + line;
    }
    if (line.startsWith('  ')) {
      changedChars -= 2;
      return line.substring(2);
    }
    if (line.startsWith(' ')) {
      changedChars -= 1;
      return line.substring(1);
    }
    return line;
  }).join('\n');

  editor.value = value.substring(0, lineStart) + updated + value.substring(end);
  editor.selectionStart = lineStart;
  editor.selectionEnd = end + changedChars;
  updateLineNumbers();
  updateCursorPos();
  saveCode();
}

function updateLineNumbers() {
  const lines = editor.value.split('\n');
  lineNumbers.textContent = lines.map((_, i) => i + 1).join('\n');
}

function syncScroll() {
  lineNumbers.scrollTop = editor.scrollTop;
}

function updateCursorPos() {
  const text = editor.value.substring(0, editor.selectionStart);
  const lines = text.split('\n');
  document.getElementById('cursor-pos').textContent =
    `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
}

// ── Run Code ──────────────────────────────────
async function runCode() {
  if (isRunning) return;

  const code = editor.value;
  if (!code.trim()) {
    clearOutput();
    appendOutput('// Nothing to run.', 'out-system');
    setStatus('ready', 'Ready');
    runTime.textContent = '';
    return;
  }

  if (typeof Lexer === 'undefined' || typeof Parser === 'undefined' || typeof Interpreter === 'undefined') {
    clearOutput();
    appendOutput('RuntimeError: Language engine failed to load. Refresh the page and try again.', 'out-error');
    setStatus('error', 'Error');
    return;
  }

  clearOutput();
  setRunning(true);
  setStatus('running', 'Running...');
  const startTime = performance.now();
  appendOutput('// Running...', 'out-system');

  function outputCallback(line) {
    appendOutput(String(line), 'out-normal');
  }

  function inputCallback(prompt) {
    // Keep ask synchronous so programs can continue immediately.
    const answer = window.prompt(String(prompt), '');
    return answer === null ? '' : answer;
  }

  try {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();

    const parser = new Parser(tokens);
    const ast = parser.parse();

    const interpreter = new Interpreter(outputCallback, inputCallback);
    interpreter.interpret(ast);

    const elapsed = (performance.now() - startTime).toFixed(1);
    appendOutput('', 'out-system');
    appendOutput(`// ✓ Program finished in ${elapsed}ms`, 'out-success');
    setStatus('ready', 'Done');
    runTime.textContent = `${elapsed}ms`;

  } catch (err) {
    const elapsed = (performance.now() - startTime).toFixed(1);
    const lineInfo = err.line ? ` (line ${err.line})` : '';
    appendOutput('', 'out-system');
    appendOutput(`${err.name}${lineInfo}: ${err.message}`, 'out-error');
    appendOutput('', 'out-system');
    appendOutput('// 💡 Tip: Check your syntax. Keywords: set, say, if, end, loop, define, call', 'out-system');
    setStatus('error', 'Error');
    runTime.textContent = `${elapsed}ms`;
  } finally {
    setRunning(false);
  }
}

function setRunning(running) {
  isRunning = running;
  if (!runBtn) return;
  runBtn.disabled = running;
  runBtn.classList.toggle('running', running);
  runBtn.textContent = running ? 'Running...' : '▶ Run';
}

function appendOutput(text, cls = 'out-normal') {
  const span = document.createElement('span');
  span.className = `out-line ${cls}`;
  span.textContent = text;
  outputArea.appendChild(span);
  outputArea.scrollTop = outputArea.scrollHeight;
}

function clearOutput() {
  outputArea.innerHTML = '';
  appendOutput('// EasyLang v1.0 — Ready to run. Press Ctrl+Enter or click ▶ Run', 'out-system');
}

function clearCode() {
  if (confirm('Clear the editor? Your code will be lost.')) {
    editor.value = '';
    clearOutput();
    updateLineNumbers();
    updateCursorPos();
    setStatus('ready', 'Ready');
    runTime.textContent = '';
    saveCode();
  }
}

function setStatus(state, text) {
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = text;
}

// ── Examples ──────────────────────────────────
function loadExample(key) {
  if (!key) return;
  const code = EXAMPLES[key];
  if (!code) return;
  editor.value = code;
  updateLineNumbers();
  saveCode();
  clearOutput();
  appendOutput(`// Loaded example: ${key}`, 'out-system');
  document.getElementById('example-select').value = '';
}

// ── Share ──────────────────────────────────────
function shareCode() {
  const code = editor.value;
  const encoded = encodeCodeForUrl(code);
  const url = `${location.href.split('?')[0]}?code=${encoded}`;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('✅', 'Link copied to clipboard!', 'success');
    }).catch(() => {
      prompt('Copy this link:', url);
    });
    return;
  }
  prompt('Copy this link:', url);
}

function getCodeFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('code')) {
      return decodeCodeFromUrl(params.get('code'));
    }
  } catch {}
  return null;
}

function encodeCodeForUrl(code) {
  return btoa(unescape(encodeURIComponent(code)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeCodeFromUrl(encoded) {
  const normalized = String(encoded)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

// ── Persist Code ───────────────────────────────
function saveCode() {
  try { localStorage.setItem('easylang_code', editor.value); } catch {}
}

function getSavedCode() {
  try { return localStorage.getItem('easylang_code'); } catch { return null; }
}

// ── Toast ──────────────────────────────────────
function showToast(icon, msg, type = 'success') {
  const toast = document.getElementById('toast');
  document.getElementById('toast-icon').textContent = icon;
  document.getElementById('toast-msg').textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => { toast.className = 'toast toast-hidden'; }, 3000);
}

// ── Prompt ─────────────────────────────────────
function submitPrompt() {
  if (!promptOverlay || !promptInput) return;
  const val = promptInput.value;
  promptInput.value = '';
  promptOverlay.classList.remove('visible');
  if (promptResolve) { promptResolve(val); promptResolve = null; }
}

// Ensure editor actions are available for inline handlers in editor.html.
if (typeof window !== 'undefined') {
  window.runCode = runCode;
  window.clearOutput = clearOutput;
  window.clearCode = clearCode;
  window.shareCode = shareCode;
  window.loadExample = loadExample;
  window.submitPrompt = submitPrompt;
}

// ── Start ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
