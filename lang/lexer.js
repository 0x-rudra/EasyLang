// ─────────────────────────────────────────────
//  EasyLang Lexer  —  Tokenizer
// ─────────────────────────────────────────────

const TokenType = {
  // Literals
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  BOOL: 'BOOL',
  NULL: 'NULL',

  // Identifiers
  IDENTIFIER: 'IDENTIFIER',

  // Keywords
  SET: 'SET', TO: 'TO', SAY: 'SAY',
  IF: 'IF', ELSE: 'ELSE', ELSEIF: 'ELSEIF', END: 'END',
  REPEAT: 'REPEAT', LOOP: 'LOOP', FROM: 'FROM', WHILE: 'WHILE',
  DEFINE: 'DEFINE', CALL: 'CALL', WITH: 'WITH', RETURN: 'RETURN',
  LIST: 'LIST', ADD: 'ADD', REMOVE: 'REMOVE',
  AND: 'AND', OR: 'OR', NOT: 'NOT',
  OF: 'OF', IN: 'IN', TIMES: 'TIMES', DO: 'DO', STOP: 'STOP',
  ASK: 'ASK',

  // Operators
  PLUS: 'PLUS', MINUS: 'MINUS', STAR: 'STAR', SLASH: 'SLASH',
  PERCENT: 'PERCENT', CARET: 'CARET',
  EQ: 'EQ', NEQ: 'NEQ', LT: 'LT', LTE: 'LTE', GT: 'GT', GTE: 'GTE',
  ASSIGN: 'ASSIGN',

  // Punctuation
  LPAREN: 'LPAREN', RPAREN: 'RPAREN',
  LBRACKET: 'LBRACKET', RBRACKET: 'RBRACKET',
  COMMA: 'COMMA', DOT: 'DOT',

  // Control
  NEWLINE: 'NEWLINE',
  EOF: 'EOF',
};

const KEYWORDS = {
  set: TokenType.SET, to: TokenType.TO, say: TokenType.SAY,
  print: TokenType.SAY,
  if: TokenType.IF, else: TokenType.ELSE, elseif: TokenType.ELSEIF,
  end: TokenType.END, repeat: TokenType.REPEAT, loop: TokenType.LOOP,
  from: TokenType.FROM, while: TokenType.WHILE, define: TokenType.DEFINE,
  call: TokenType.CALL, with: TokenType.WITH, return: TokenType.RETURN,
  list: TokenType.LIST, add: TokenType.ADD, remove: TokenType.REMOVE,
  and: TokenType.AND, or: TokenType.OR, not: TokenType.NOT,
  of: TokenType.OF, in: TokenType.IN, times: TokenType.TIMES,
  do: TokenType.DO, stop: TokenType.STOP, ask: TokenType.ASK,
  true: TokenType.BOOL, false: TokenType.BOOL, null: TokenType.NULL,
  yes: TokenType.BOOL, no: TokenType.BOOL,
};

class Token {
  constructor(type, value, line) {
    this.type = type;
    this.value = value;
    this.line = line;
  }
}

class LexerError extends Error {
  constructor(msg, line) {
    super(msg);
    this.line = line;
    this.name = 'LexerError';
  }
}

class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.tokens = [];
  }

  peek(offset = 0) { return this.source[this.pos + offset]; }
  advance() { return this.source[this.pos++]; }
  isAtEnd() { return this.pos >= this.source.length; }

  tokenize() {
    while (!this.isAtEnd()) {
      this.skipWhitespaceAndComments();
      if (this.isAtEnd()) break;

      const ch = this.peek();

      if (ch === '\n' || ch === '\r') {
        this.readNewline();
      } else if (/\d/.test(ch) || (ch === '-' && /\d/.test(this.peek(1)) && this.canBeNegative())) {
        this.readNumber();
      } else if (ch === '"' || ch === "'") {
        this.readString(ch);
      } else if (/[a-zA-Z_]/.test(ch)) {
        this.readIdentifierOrKeyword();
      } else {
        this.readOperatorOrPunct();
      }
    }

    // Ensure trailing newline
    if (this.tokens.length > 0 && this.tokens[this.tokens.length - 1].type !== TokenType.NEWLINE) {
      this.tokens.push(new Token(TokenType.NEWLINE, '\n', this.line));
    }
    this.tokens.push(new Token(TokenType.EOF, null, this.line));
    return this.tokens;
  }

  canBeNegative() {
    // Negative number allowed if previous meaningful token is operator/keyword
    const last = this.lastMeaningful();
    if (!last) return true;
    const ops = [TokenType.PLUS, TokenType.MINUS, TokenType.STAR, TokenType.SLASH,
      TokenType.EQ, TokenType.NEQ, TokenType.LT, TokenType.LTE, TokenType.GT, TokenType.GTE,
      TokenType.LPAREN, TokenType.COMMA, TokenType.TO, TokenType.WITH, TokenType.FROM,
      TokenType.SET, TokenType.SAY, TokenType.RETURN, TokenType.AND, TokenType.OR, TokenType.NOT];
    return ops.includes(last.type);
  }

  lastMeaningful() {
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      if (this.tokens[i].type !== TokenType.NEWLINE) return this.tokens[i];
    }
    return null;
  }

  skipWhitespaceAndComments() {
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t') { this.advance(); }
      else if (ch === '#') { while (!this.isAtEnd() && this.peek() !== '\n') this.advance(); }
      else break;
    }
  }

  readNewline() {
    while (!this.isAtEnd() && (this.peek() === '\n' || this.peek() === '\r')) {
      if (this.peek() === '\n') this.line++;
      this.advance();
    }
    // Deduplicate newlines
    if (this.tokens.length === 0 || this.tokens[this.tokens.length - 1].type === TokenType.NEWLINE) return;
    this.tokens.push(new Token(TokenType.NEWLINE, '\n', this.line));
  }

  readNumber() {
    let start = this.pos;
    if (this.peek() === '-') this.advance();
    while (!this.isAtEnd() && /\d/.test(this.peek())) this.advance();
    if (!this.isAtEnd() && this.peek() === '.' && /\d/.test(this.peek(1))) {
      this.advance();
      while (!this.isAtEnd() && /\d/.test(this.peek())) this.advance();
    }
    const raw = this.source.slice(start, this.pos);
    this.tokens.push(new Token(TokenType.NUMBER, parseFloat(raw), this.line));
  }

  readString(quote) {
    this.advance(); // opening quote
    let str = '';
    while (!this.isAtEnd() && this.peek() !== quote) {
      const ch = this.advance();
      if (ch === '\\') {
        const esc = this.advance();
        if (esc === 'n') str += '\n';
        else if (esc === 't') str += '\t';
        else str += esc;
      } else {
        str += ch;
      }
    }
    if (this.isAtEnd()) throw new LexerError(`Unterminated string on line ${this.line}`, this.line);
    this.advance(); // closing quote
    this.tokens.push(new Token(TokenType.STRING, str, this.line));
  }

  readIdentifierOrKeyword() {
    let start = this.pos;
    while (!this.isAtEnd() && /[a-zA-Z0-9_]/.test(this.peek())) this.advance();
    const word = this.source.slice(start, this.pos);
    const lower = word.toLowerCase();
    if (KEYWORDS[lower] !== undefined) {
      let val = lower;
      if (lower === 'true' || lower === 'yes') val = true;
      else if (lower === 'false' || lower === 'no') val = false;
      else if (lower === 'null') val = null;
      this.tokens.push(new Token(KEYWORDS[lower], val, this.line));
    } else {
      this.tokens.push(new Token(TokenType.IDENTIFIER, word, this.line));
    }
  }

  readOperatorOrPunct() {
    const ch = this.advance();
    const next = this.peek();
    switch (ch) {
      case '+': this.tokens.push(new Token(TokenType.PLUS, '+', this.line)); break;
      case '-': this.tokens.push(new Token(TokenType.MINUS, '-', this.line)); break;
      case '*': this.tokens.push(new Token(TokenType.STAR, '*', this.line)); break;
      case '/': this.tokens.push(new Token(TokenType.SLASH, '/', this.line)); break;
      case '%': this.tokens.push(new Token(TokenType.PERCENT, '%', this.line)); break;
      case '^': this.tokens.push(new Token(TokenType.CARET, '^', this.line)); break;
      case '(': this.tokens.push(new Token(TokenType.LPAREN, '(', this.line)); break;
      case ')': this.tokens.push(new Token(TokenType.RPAREN, ')', this.line)); break;
      case '[': this.tokens.push(new Token(TokenType.LBRACKET, '[', this.line)); break;
      case ']': this.tokens.push(new Token(TokenType.RBRACKET, ']', this.line)); break;
      case ',': this.tokens.push(new Token(TokenType.COMMA, ',', this.line)); break;
      case '.': this.tokens.push(new Token(TokenType.DOT, '.', this.line)); break;
      case '=':
        if (next === '=') { this.advance(); this.tokens.push(new Token(TokenType.EQ, '==', this.line)); }
        else { this.tokens.push(new Token(TokenType.ASSIGN, '=', this.line)); }
        break;
      case '!':
        if (next === '=') { this.advance(); this.tokens.push(new Token(TokenType.NEQ, '!=', this.line)); }
        else throw new LexerError(`Unexpected '!' on line ${this.line}. Did you mean '!='?`, this.line);
        break;
      case '<':
        if (next === '=') { this.advance(); this.tokens.push(new Token(TokenType.LTE, '<=', this.line)); }
        else { this.tokens.push(new Token(TokenType.LT, '<', this.line)); }
        break;
      case '>':
        if (next === '=') { this.advance(); this.tokens.push(new Token(TokenType.GTE, '>=', this.line)); }
        else { this.tokens.push(new Token(TokenType.GT, '>', this.line)); }
        break;
      default:
        throw new LexerError(`Unexpected character '${ch}' on line ${this.line}`, this.line);
    }
  }
}

// Export (browser: globals via script tag; Node.js: require)
if (typeof module !== 'undefined') module.exports = { Lexer, Token, TokenType, KEYWORDS, LexerError };
